import BN from 'bn.js';
import { contractAddress, Cell, StateInit } from 'ton';
import { getDealCodeCell } from '../contract/Deal.code';
import { excessAmount, Queries } from '../contract/Deal.data';
import { tonDeepLink } from '../utils/tonDeepLink';
import Deal from './deal/Deal';
import { CommonDealPart, DEAL_WORKCHAIN, getDealAddress, getDealDataCell } from './DealStorage';

export const deployDealDeepLink = async (id: number, deal: Deal, commonDealPart: CommonDealPart) => {
    const code = await getDealCodeCell();

    const data = getDealDataCell(id, deal, commonDealPart);
    
    const addr = contractAddress({
        workchain: DEAL_WORKCHAIN,
        initialCode: code,
        initialData: data,
    })

    const stateInit = new Cell();
    new StateInit({
        code,
        data,
    }).writeTo(stateInit);

    return tonDeepLink(addr, deal.feeAmount.add(deal.coinsAmount).add(excessAmount), new Cell(), stateInit);
};

export const cancelDealDeepLink = async (id: number, deal: Deal, commonDealPart: CommonDealPart, amount: BN) => {
    const addr = await getDealAddress(id, deal, commonDealPart);

    return tonDeepLink(addr, amount, Queries.internalCancel({}));
};