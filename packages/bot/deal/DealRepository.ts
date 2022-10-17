import Deal from './Deal';

interface DealRepository {
    createDeal(deal: Deal): Promise<number>;
    getDeal(id: number): Promise<Deal | undefined>;
}

export default DealRepository;