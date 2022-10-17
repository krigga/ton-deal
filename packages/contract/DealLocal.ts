import BN from 'bn.js';
import { Address, Cell, contractAddress, Slice } from 'ton';
import { SmartContract } from 'ton-contract-executor';
import { getDealCodeCell, getDealCompileResult } from './Deal.code';
import { buildDealDataCell, DealData, excessAmount, Queries } from './Deal.data';

export class DealLocal {
    private constructor(
        public readonly contract: SmartContract,
        public readonly address: Address,
    ) {}

    public static readonly queries = Queries;

    public static readonly excessAmount = excessAmount;

    async getDealState(): Promise<DealData> {
        const result = await this.contract.invokeGetMethod('get_deal_state', []);
        if (result.type === 'failed') {
            throw new Error('cannot invoke get_deal_state');
        }

        const stack = result.result as [BN, BN, Slice, Slice, BN, BN, Slice, BN, BN];

        const buyerAddress = stack[2].readAddress();
        if (buyerAddress === null) {
            throw new Error('could not read buyer address');
        }

        const sellerAddress = stack[3].readAddress();
        if (sellerAddress === null) {
            throw new Error('could not read seller address');
        }

        const feeGainerAddress = stack[6].readAddress();
        if (feeGainerAddress === null) {
            throw new Error('could not read fee gainer address');
        }

        return {
            dealId: stack[0].toNumber(),
            state: stack[1].toNumber(),
            buyerAddress,
            sellerAddress,
            expiresAt: stack[4].toNumber(),
            guarantorPublicKey: stack[5].toBuffer('be', 32),
            feeGainerAddress,
            feeAmount: stack[7],
            coinsAmount: stack[8],
        };
    }

    static async createFromConfig(config: DealData) {
        const codeCell = await getDealCodeCell();

        const dataCell = buildDealDataCell(config);

        const contract = await SmartContract.fromCell(codeCell, dataCell, {
            debug: true,
        });

        const address = contractAddress({
            workchain: 0,
            initialCode: codeCell,
            initialData: dataCell,
        });

        contract.setC7Config({
            myself: address,
        });

        return new DealLocal(contract, address);
    }
}