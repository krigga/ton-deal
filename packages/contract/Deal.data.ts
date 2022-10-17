import BN from 'bn.js';
import { Address, Cell, toNano } from 'ton';
import { sign } from 'ton-crypto';

export const excessAmount = toNano('0.05');

export const DealError = {
    notActive: 101,
    invalidOp: 102,
    notExpired: 103,
    invalidSignature: 104,
    wrongTarget: 105,
    notEnoughCoins: 106,
};

export type DealData = {
    dealId: number;
    state: number;
    buyerAddress: Address;
    sellerAddress: Address;
    expiresAt: number;
    guarantorPublicKey: Buffer;
    feeGainerAddress: Address;
    feeAmount: BN;
    coinsAmount: BN;
};

export const DealState = {
    uninitialized: 0,
    active: 1,
    completed: 2,
    cancelled: 3,
};

export const buildDealDataCell = (data: DealData): Cell => {
    const c = new Cell();
    c.bits.writeUint(data.dealId, 64);
    c.bits.writeUint(data.state, 2);
    c.bits.writeAddress(data.buyerAddress);
    c.bits.writeAddress(data.sellerAddress);
    c.bits.writeUint(data.expiresAt, 64);

    const admins = new Cell();
    admins.bits.writeBuffer(data.guarantorPublicKey);
    admins.bits.writeAddress(data.feeGainerAddress);
    c.refs[0] = admins;

    const amounts = new Cell();
    amounts.bits.writeCoins(data.feeAmount);
    amounts.bits.writeCoins(data.coinsAmount);
    c.refs[1] = amounts;

    return c;
};

export const OpCodes = {
    complete: 1,
    cancel: 2,
    sellerCompletion: 0x4e8eec8f,
    feeGainerCompletion: 0x11397f78,
    cancellation: 0x72551da1,
};

const createSignedMessage = (params: { queryId?: number, targetAddress: Address, secretKey: Buffer, opCode: number }) => {
    const c = new Cell();
    c.bits.writeUint(params.opCode, 32);
    c.bits.writeUint(params.queryId || 0, 64);
    c.bits.writeAddress(params.targetAddress);

    const sig = sign(c.hash(), params.secretKey);
    const sigCell = new Cell();
    sigCell.bits.writeBuffer(sig);
    c.refs[0] = sigCell;

    return c;
};

export const Queries = {
    internalCancel: (params: { queryId?: number }) => {
        const c = new Cell();
        c.bits.writeUint(OpCodes.cancel, 32);
        c.bits.writeUint(params.queryId || 0, 64);

        return c;
    },
    externalCancel: (params: { queryId?: number, targetAddress: Address, secretKey: Buffer }) =>
                    createSignedMessage({ ...params, opCode: OpCodes.cancel }),
    externalComplete: (params: { queryId?: number, targetAddress: Address, secretKey: Buffer }) =>
                    createSignedMessage({ ...params, opCode: OpCodes.complete }),
    cancellation: (params: { queryId?: number }) => {
        const c = new Cell();
        c.bits.writeUint(OpCodes.cancellation, 32);
        c.bits.writeUint(params.queryId || 0, 64);

        return c;
    },
    sellerCompletion: (params: { queryId?: number }) => {
        const c = new Cell();
        c.bits.writeUint(OpCodes.sellerCompletion, 32);
        c.bits.writeUint(params.queryId || 0, 64);

        return c;
    },
    feeGainerCompletion: (params: { queryId?: number }) => {
        const c = new Cell();
        c.bits.writeUint(OpCodes.feeGainerCompletion, 32);
        c.bits.writeUint(params.queryId || 0, 64);

        return c;
    },
};