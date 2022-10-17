import TelegramBot from 'node-telegram-bot-api';
import { Address, CellMessage, CommonMessageInfo, ExternalMessage, fromNano, toNano, TonClient } from 'ton';
import { DealData, DealState, Queries } from '../contract/Deal.data';
import * as QRCode from 'qrcode';
import DealStorage, {  } from './DealStorage';
import MapDealRepository from './deal/MapDealRepository';
import Deal from './deal/Deal';
import BN from 'bn.js';
import { config } from 'dotenv';
import { keyPairFromSecretKey } from 'ton-crypto';
import { cancelDealDeepLink, deployDealDeepLink } from './deeplinks';
import { formatSeconds } from './formatDuration';

config();

const token = process.env.TELEGRAM_API_KEY!;

const dealsExpireIn = parseInt(process.env.DEALS_EXPIRE_HOURS!) * 60 * 60;

const unixTimeNow = () => Math.floor(Date.now() / 1000);

const fee = toNano(process.env.FEE!);
const feeGainer = Address.parse(process.env.FEE_GAINER!);

const minDealAmount = toNano('0.01');
const internalMessageFee = toNano('0.01');

const catchAll = <F extends (...args: any) => Promise<T>, T>(cb: (...args: Parameters<F>) => Promise<T>) => {
    return async (...args: Parameters<F>) => {
        try {
            await cb(...args);
        } catch (e) {
            console.error(e);
        }
    };
};

const getDealOrSendError = async (msg: TelegramBot.Message, match: RegExpExecArray | null, dealStorage: DealStorage, bot: TelegramBot): Promise<{
    deal: Deal,
    address: Address,
    data: DealData,
    id: number,
} | undefined> => {
    if (match === null) return undefined;

    const id = parseInt(match[1]);

    const data = await dealStorage.getFullDealData(id);

    if (data === undefined) {
        await bot.sendMessage(msg.chat.id, 'deal does not exist');
        return undefined;
    }

    if (data.data === undefined) {
        await bot.sendMessage(msg.chat.id, 'deal is not deployed');
        return undefined;
    }

    return {
        ...data,
        data: data.data,
        id,
    };
};

const sendQRCode = async (bot: TelegramBot, chatId: number, qrData: string, caption: string) =>
    await bot.sendPhoto(chatId, await QRCode.toBuffer(qrData, {
        type: 'png',
        errorCorrectionLevel: 'M',
    }), {
        caption,
        parse_mode: 'HTML',
    }, {
        filename: 'qr.png',
        contentType: 'image/png',
    });

const main = async () => {
    const client = new TonClient({
        endpoint: process.env.TON_CLIENT_ENDPOINT!,
        apiKey: process.env.TON_CLIENT_API_KEY!,
    });

    const kp = await keyPairFromSecretKey(Buffer.from(process.env.GUARANTOR_SECRET_KEY!, 'hex'));

    const commonPart = {
        guarantorPublicKey: kp.publicKey,
        feeGainerAddress: feeGainer,
    };

    const dealStorage = new DealStorage(new MapDealRepository(), client, commonPart);

    const bot = new TelegramBot(token, { polling: true });

    bot.onText(/\/createdeal ([a-zA-Z0-9\-_+=:]+) ([a-zA-Z0-9\-_+=:]+) ([0-9.]+)/, catchAll(async (msg: TelegramBot.Message, match: RegExpExecArray | null) => {
        if (match === null) return;

        let buyer, seller: Address;
        let coins: BN;
        try {
            buyer = Address.parse(match[1]);
            seller = Address.parse(match[2]);
            coins = toNano(match[3]);
        } catch (e) {
            await bot.sendMessage(msg.chat.id, 'could not parse input params');
            console.error(e);
            return;
        }

        if (buyer.equals(seller)) {
            await bot.sendMessage(msg.chat.id, 'buyer and seller cannot be the same address');
            return;
        }

        if (coins.lt(minDealAmount)) {
            await bot.sendMessage(msg.chat.id, `cannot create deal with less than ${fromNano(minDealAmount)} coins`);
            return;
        }

        const deal: Deal = {
            buyerAddress: buyer,
            sellerAddress: seller,
            expiresAt: unixTimeNow() + dealsExpireIn,
            feeAmount: fee,
            coinsAmount: coins,
        };

        const id = await dealStorage.createDeal(deal);

        const link = await deployDealDeepLink(id, deal, commonPart);

        await sendQRCode(
            bot,
            msg.chat.id,
            link,
            `successfully created a new deal\n<code>ID ${id}\nBuyer ${buyer.toFriendly()}\nSeller ${seller.toFriendly()}\nExpires ${new Date(deal.expiresAt * 1000).toString()}\nAmount ${fromNano(deal.coinsAmount)} TON\nFee ${fromNano(deal.feeAmount)} TON</code>\nplease deploy it using the QR code above, or using this <a href="${link}">link</a>`,
        );
    }));

    bot.onText(/\/getdeal (\d+)/, catchAll(async (msg: TelegramBot.Message, match: RegExpExecArray | null) => {
        const data = await getDealOrSendError(msg, match, dealStorage, bot);
        if (data === undefined) return;

        switch (data.data.state) {
            case DealState.uninitialized: {
                await bot.sendMessage(msg.chat.id, 'deal is deployed but not initialized');
                return;
            }
            case DealState.active: {
                const now = unixTimeNow();
                if (now < data.data.expiresAt) {
                    await bot.sendMessage(msg.chat.id, `deal is active, expires ${new Date(data.data.expiresAt * 1000).toString()}\n(in ${formatSeconds(data.data.expiresAt - now)})`);
                } else {
                    await bot.sendMessage(msg.chat.id, 'deal is active but expired, buyer can withdraw their funds');
                }
                return;
            }
            case DealState.cancelled:
            case DealState.completed: {
                await bot.sendMessage(msg.chat.id, `deal is ${data.data.state === DealState.cancelled ? 'cancelled' : 'completed'}`);
                return;
            }
            default: {
                console.error(`unknown deal state ${data.data.state}`);
                return;
            }
        }
    }));

    bot.onText(/\/completedealadmin (\d+)/, catchAll(async (msg: TelegramBot.Message, match: RegExpExecArray | null) => {
        const data = await getDealOrSendError(msg, match, dealStorage, bot);
        if (data === undefined) return;

        if (data.data.state !== DealState.active) {
            await bot.sendMessage(msg.chat.id, 'deal is not active');
            return;
        }

        await client.sendMessage(new ExternalMessage({
            to: data.address,
            body: new CommonMessageInfo({
                body: new CellMessage(Queries.externalComplete({
                    targetAddress: data.address,
                    secretKey: kp.secretKey,
                })),
            }),
        }));

        await bot.sendMessage(msg.chat.id, 'success');
    }));

    bot.onText(/\/canceldealadmin (\d+)/, catchAll(async (msg: TelegramBot.Message, match: RegExpExecArray | null) => {
        const data = await getDealOrSendError(msg, match, dealStorage, bot);
        if (data === undefined) return;

        if (data.data.state !== DealState.active) {
            await bot.sendMessage(msg.chat.id, 'deal is not active');
            return;
        }

        await client.sendMessage(new ExternalMessage({
            to: data.address,
            body: new CommonMessageInfo({
                body: new CellMessage(Queries.externalCancel({
                    targetAddress: data.address,
                    secretKey: kp.secretKey,
                })),
            }),
        }));

        await bot.sendMessage(msg.chat.id, 'success');
    }));

    bot.onText(/\/canceldealseller (\d+)/, catchAll(async (msg: TelegramBot.Message, match: RegExpExecArray | null) => {
        const data = await getDealOrSendError(msg, match, dealStorage, bot);
        if (data === undefined) return;

        if (data.data.state !== DealState.active) {
            await bot.sendMessage(msg.chat.id, 'deal is not active');
            return;
        }

        const link = await cancelDealDeepLink(data.id, data.deal, commonPart, internalMessageFee);

        await sendQRCode(
            bot,
            msg.chat.id,
            link,
            `use the QR code above or this <a href="${link}">link</a> to cancel the deal`,
        );
    }));

    bot.onText(/\/canceldealbuyer (\d+)/, catchAll(async (msg: TelegramBot.Message, match: RegExpExecArray | null) => {
        const data = await getDealOrSendError(msg, match, dealStorage, bot);
        if (data === undefined) return;

        if (data.data.state !== DealState.active) {
            await bot.sendMessage(msg.chat.id, 'deal is not active');
            return;
        }

        if (unixTimeNow() < data.data.expiresAt) {
            await bot.sendMessage(msg.chat.id, 'deal has not expired yet');
            return;
        }

        const link = await cancelDealDeepLink(data.id, data.deal, commonPart, internalMessageFee);

        await sendQRCode(
            bot,
            msg.chat.id,
            link,
            `use the QR code above or this <a href="${link}">link</a> to cancel the deal`,
        );
    }));
};

main();

