import { Address, contractAddress, TonClient } from 'ton';
import { getDealCodeCell } from '../contract/Deal.code';
import { buildDealDataCell, DealData, DealState } from '../contract/Deal.data';
import { parseDealDataStack } from './parseDealDataStack';
import Deal from './deal/Deal';
import DealRepository from './deal/DealRepository';

export interface CommonDealPart {
    guarantorPublicKey: Buffer;
    feeGainerAddress: Address;
}

interface FullDealData {
    deal: Deal;
    data?: DealData;
    address: Address;
}

export const DEAL_WORKCHAIN = 0;

export const getDealDataCell = (id: number, deal: Deal, commonDealPart: CommonDealPart) =>
    buildDealDataCell({
        ...deal,
        ...commonDealPart,
        dealId: id,
        state: DealState.uninitialized,
    });

export const getDealAddress = async (id: number, deal: Deal, commonDealPart: CommonDealPart) =>
    contractAddress({
        workchain: DEAL_WORKCHAIN,
        initialCode: await getDealCodeCell(),
        initialData: getDealDataCell(id, deal, commonDealPart),
    });

export default class DealStorage {
    constructor(
        private dealRepository: DealRepository,
        private tonClient: TonClient,
        private commonDealPart: CommonDealPart,
    ) {}

    async createDeal(deal: Deal) {
        return await this.dealRepository.createDeal(deal);
    }

    async getFullDealData(id: number): Promise<FullDealData | undefined> {
        const deal = await this.dealRepository.getDeal(id);
        if (deal === undefined) return undefined;

        const address = await getDealAddress(id, deal, this.commonDealPart);

        const result = await this.tonClient.callGetMethodWithError(address, 'get_deal_state');
        
        if (result.exit_code !== 0) return { deal, address };

        return {
            deal,
            address,
            data: parseDealDataStack(result.stack),
        };
    }
}