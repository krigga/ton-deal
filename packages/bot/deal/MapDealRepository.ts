import Deal from './Deal';
import DealRepository from './DealRepository';

export default class MapDealRepository implements DealRepository {
    private previousDealId: number = 0;
    private dealMap: Map<number, Deal> = new Map();

    async createDeal(deal: Deal): Promise<number> {
        const id = ++this.previousDealId;
        this.dealMap.set(id, deal);
        return id;
    }

    async getDeal(id: number): Promise<Deal | undefined> {
        if (!this.dealMap.has(id)) return undefined;
        return this.dealMap.get(id);
    }
}