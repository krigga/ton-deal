import BN from 'bn.js';
import { Address } from 'ton';

type Deal = {
    buyerAddress: Address,
    sellerAddress: Address,
    expiresAt: number,
    feeAmount: BN,
    coinsAmount: BN,
};

export default Deal;