import BN from 'bn.js';
import { Cell, Slice } from 'ton';
import { DealData } from '../contract/Deal.data';

export const parseStackNum = (n: any) => new BN(n[1].substring(2), 16);
export const parseStackCell = (c: any) => Cell.fromBoc(Buffer.from(c[1].bytes, 'base64'))[0];

export const parseDealDataStack = (s: any[]): DealData => {
    const buyerAddress = Slice.fromCell(parseStackCell(s[2])).readAddress();
    if (buyerAddress === null) {
        throw new Error('could not read buyer address');
    }

    const sellerAddress = Slice.fromCell(parseStackCell(s[3])).readAddress();
    if (sellerAddress === null) {
        throw new Error('could not read seller address');
    }

    const feeGainerAddress = Slice.fromCell(parseStackCell(s[6])).readAddress();
    if (feeGainerAddress === null) {
        throw new Error('could not read fee gainer address');
    }

    return {
        dealId: parseStackNum(s[0]).toNumber(),
        state: parseStackNum(s[1]).toNumber(),
        buyerAddress,
        sellerAddress,
        expiresAt: parseStackNum(s[4]).toNumber(),
        guarantorPublicKey: parseStackNum(s[5]).toBuffer('be', 32),
        feeGainerAddress,
        feeAmount: parseStackNum(s[7]),
        coinsAmount: parseStackNum(s[8]),
    };
};