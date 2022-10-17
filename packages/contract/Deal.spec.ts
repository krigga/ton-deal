import BN from 'bn.js';
import { Address, Cell, CellMessage, CommonMessageInfo, ExternalMessage, InternalMessage, toNano } from 'ton';
import { OutAction, SmartContract } from 'ton-contract-executor';
import { KeyPair } from 'ton-crypto';
import { randomAddress } from '../utils/randomAddress';
import { randomKeyPair } from '../utils/randomKeyPair';
import { DealData, DealError, DealState } from './Deal.data';
import { DealLocal } from './DealLocal';

const BUYER = randomAddress();
const SELLER = randomAddress();
const FEE_GAINER = randomAddress();
const INITIALIZER = randomAddress();

let GUARANTOR_KEY_PAIR: KeyPair;
let defaultConfig: DealData;

const unixNow = Math.floor(Date.now() / 1000);
const expiresIn = 72 * 60 * 60; // 3 days

beforeAll(async () => {
    GUARANTOR_KEY_PAIR = await randomKeyPair();
    defaultConfig = {
        dealId: 1,
        state: DealState.uninitialized,
        buyerAddress: BUYER,
        sellerAddress: SELLER,
        expiresAt: unixNow + expiresIn,
        guarantorPublicKey: GUARANTOR_KEY_PAIR.publicKey,
        feeGainerAddress: FEE_GAINER,
        feeAmount: toNano('0.1'),
        coinsAmount: toNano('1'),
    };
});

describe('Deal', () => {
    it('should query state correctly', async () => {
        const deal = await DealLocal.createFromConfig(defaultConfig);

        const state = await deal.getDealState();

        expect.assertions(9);

        expect(defaultConfig.dealId).toBe(state.dealId);
        expect(defaultConfig.state).toBe(state.state);
        expect(defaultConfig.buyerAddress.equals(state.buyerAddress)).toBeTruthy();
        expect(defaultConfig.sellerAddress.equals(state.sellerAddress)).toBeTruthy();
        expect(defaultConfig.expiresAt).toBe(state.expiresAt);
        expect(defaultConfig.guarantorPublicKey.equals(state.guarantorPublicKey)).toBeTruthy();
        expect(defaultConfig.feeGainerAddress.equals(state.feeGainerAddress)).toBeTruthy();
        expect(defaultConfig.feeAmount.eq(state.feeAmount)).toBeTruthy();
        expect(defaultConfig.coinsAmount.eq(state.coinsAmount)).toBeTruthy();
    });

    it('should initialize with enough coins', async () => {
        const deal = await DealLocal.createFromConfig(defaultConfig);

        const result = await deal.contract.sendInternalMessage(new InternalMessage({
            to: deal.address,
            value: defaultConfig.feeAmount.add(defaultConfig.coinsAmount).add(DealLocal.excessAmount),
            bounce: true,
            body: new CommonMessageInfo({
                body: new CellMessage(new Cell()),
            }),
            from: INITIALIZER,
        }));

        expect(result.exit_code).toBe(0);

        const state = await deal.getDealState();

        expect(state.state).toBe(DealState.active);
    });

    it('should not initialize with not enough coins', async () => {
        const deal = await DealLocal.createFromConfig(defaultConfig);

        const result = await deal.contract.sendInternalMessage(new InternalMessage({
            to: deal.address,
            value: defaultConfig.feeAmount.add(defaultConfig.coinsAmount).add(DealLocal.excessAmount).subn(1),
            bounce: true,
            body: new CommonMessageInfo({
                body: new CellMessage(new Cell()),
            }),
            from: INITIALIZER,
        }));

        expect(result.exit_code).toBe(DealError.notEnoughCoins);
    });

    it('should cancel upon sellers request', async () => {
        const config = Object.assign({}, defaultConfig);
        config.state = DealState.active;
        const deal = await DealLocal.createFromConfig(config);

        const queryId = 123;

        const result = await deal.contract.sendInternalMessage(new InternalMessage({
            to: deal.address,
            value: new BN(0),
            bounce: true,
            body: new CommonMessageInfo({
                body: new CellMessage(DealLocal.queries.internalCancel({ queryId })),
            }),
            from: SELLER,
        }));

        expect(result.exit_code).toBe(0);

        checkActions(result.actionList, [
            {
                to: BUYER,
                amount: config.feeAmount.add(config.coinsAmount),
                mode: 1,
                body: DealLocal.queries.cancellation({ queryId }),
            },
        ], []);

        const state = await deal.getDealState();

        expect(state.state).toBe(DealState.cancelled);
    });

    it('should cancel upon guarantor\'s request', async () => {
        const config = Object.assign({}, defaultConfig);
        config.state = DealState.active;
        const deal = await DealLocal.createFromConfig(config);

        const queryId = 123;

        const result = await deal.contract.sendExternalMessage(new ExternalMessage({
            to: deal.address,
            body: new CommonMessageInfo({
                body: new CellMessage(DealLocal.queries.externalCancel({
                    queryId,
                    targetAddress: deal.address,
                    secretKey: GUARANTOR_KEY_PAIR.secretKey,
                })),
            }),
        }));

        expect(result.exit_code).toBe(0);

        checkActions(result.actionList, [
            {
                to: BUYER,
                amount: config.feeAmount.add(config.coinsAmount),
                mode: 1,
                body: DealLocal.queries.cancellation({ queryId }),
            },
        ], []);

        const state = await deal.getDealState();

        expect(state.state).toBe(DealState.cancelled);
    });

    it('should complete upon guarantor\'s request', async () => {
        const config = Object.assign({}, defaultConfig);
        config.state = DealState.active;
        const deal = await DealLocal.createFromConfig(config);

        const queryId = 123;

        const result = await deal.contract.sendExternalMessage(new ExternalMessage({
            to: deal.address,
            body: new CommonMessageInfo({
                body: new CellMessage(DealLocal.queries.externalComplete({
                    queryId,
                    targetAddress: deal.address,
                    secretKey: GUARANTOR_KEY_PAIR.secretKey,
                })),
            }),
        }));

        expect(result.exit_code).toBe(0);

        checkActions(result.actionList, [
            {
                to: SELLER,
                amount: config.coinsAmount,
                mode: 1,
                body: DealLocal.queries.sellerCompletion({ queryId }),
            },
            {
                to: FEE_GAINER,
                amount: config.feeAmount,
                mode: 1,
                body: DealLocal.queries.feeGainerCompletion({ queryId }),
            },
        ], []);

        const state = await deal.getDealState();

        expect(state.state).toBe(DealState.completed);
    });

    it('should complete upon guarantor\'s request and send no coins to fee gainer if fee amount is 0', async () => {
        const config = Object.assign({}, defaultConfig);
        config.state = DealState.active;
        config.feeAmount = new BN(0);
        const deal = await DealLocal.createFromConfig(config);

        const queryId = 123;

        const result = await deal.contract.sendExternalMessage(new ExternalMessage({
            to: deal.address,
            body: new CommonMessageInfo({
                body: new CellMessage(DealLocal.queries.externalComplete({
                    queryId,
                    targetAddress: deal.address,
                    secretKey: GUARANTOR_KEY_PAIR.secretKey,
                })),
            }),
        }));

        expect(result.exit_code).toBe(0);

        checkActions(result.actionList, [
            {
                to: SELLER,
                amount: config.coinsAmount,
                mode: 1,
                body: DealLocal.queries.sellerCompletion({ queryId }),
            },
        ], []);

        const state = await deal.getDealState();

        expect(state.state).toBe(DealState.completed);
    });

    it('should not cancel upon buyer\'s request before expiration', async () => {
        const config = Object.assign({}, defaultConfig);
        config.state = DealState.active;
        const deal = await DealLocal.createFromConfig(config);
        deal.contract.setUnixTime(config.expiresAt - 1);

        const result = await deal.contract.sendInternalMessage(new InternalMessage({
            to: deal.address,
            value: new BN(0),
            bounce: true,
            body: new CommonMessageInfo({
                body: new CellMessage(DealLocal.queries.internalCancel({})),
            }),
            from: BUYER,
        }));

        expect(result.exit_code).toBe(DealError.notExpired);
    });

    it('should cancel upon buyer\'s request after expiration', async () => {
        const config = Object.assign({}, defaultConfig);
        config.state = DealState.active;
        const deal = await DealLocal.createFromConfig(config);
        deal.contract.setUnixTime(config.expiresAt);

        const queryId = 123;

        const result = await deal.contract.sendInternalMessage(new InternalMessage({
            to: deal.address,
            value: new BN(0),
            bounce: true,
            body: new CommonMessageInfo({
                body: new CellMessage(DealLocal.queries.internalCancel({ queryId })),
            }),
            from: BUYER,
        }));

        expect(result.exit_code).toBe(0);

        checkActions(result.actionList, [
            {
                to: BUYER,
                amount: config.feeAmount.add(config.coinsAmount),
                mode: 1,
                body: DealLocal.queries.cancellation({ queryId }),
            },
        ], []);

        const state = await deal.getDealState();

        expect(state.state).toBe(DealState.cancelled);
    });

    it('should reject guarantor\'s requests for wrong target', async () => {
        const config = Object.assign({}, defaultConfig);
        config.state = DealState.active;
        const deal = await DealLocal.createFromConfig(config);

        const fakeTarget = randomAddress();

        const queries: Cell[] = [
            DealLocal.queries.externalComplete({
                targetAddress: fakeTarget,
                secretKey: GUARANTOR_KEY_PAIR.secretKey,
            }),
            DealLocal.queries.externalCancel({
                targetAddress: fakeTarget,
                secretKey: GUARANTOR_KEY_PAIR.secretKey,
            }),
        ];

        expect.assertions(queries.length);

        for (const q of queries) {
            const result = await deal.contract.sendExternalMessage(new ExternalMessage({
                to: deal.address,
                body: new CommonMessageInfo({
                    body: new CellMessage(q),
                }),
            }));

            expect(result.exit_code).toBe(DealError.wrongTarget);
        }
    });

    it('should reject external messages with invalid signatures', async () => {
        const config = Object.assign({}, defaultConfig);
        config.state = DealState.active;
        const deal = await DealLocal.createFromConfig(config);

        const fakeKeyPair = await randomKeyPair();

        const queries: Cell[] = [
            DealLocal.queries.externalComplete({
                targetAddress: deal.address,
                secretKey: fakeKeyPair.secretKey,
            }),
            DealLocal.queries.externalCancel({
                targetAddress: deal.address,
                secretKey: fakeKeyPair.secretKey,
            }),
        ];

        expect.assertions(queries.length);

        for (const q of queries) {
            const result = await deal.contract.sendExternalMessage(new ExternalMessage({
                to: deal.address,
                body: new CommonMessageInfo({
                    body: new CellMessage(q),
                }),
            }));

            expect(result.exit_code).toBe(DealError.invalidSignature);
        }
    });

    it('should reject any valid messages when not in active state', async () => {
        const states: { state: number, expectedInternalError: number }[] = [
            {
                state: DealState.cancelled,
                expectedInternalError: DealError.notActive,
            },
            {
                state: DealState.completed,
                expectedInternalError: DealError.notActive,
            },
            {
                state: DealState.uninitialized,
                expectedInternalError: DealError.notEnoughCoins,
            },
        ];

        for (const state of states) {
            const config = Object.assign({}, defaultConfig);
            config.state = state.state;
            const deal = await DealLocal.createFromConfig(config);

            deal.contract.setUnixTime(config.expiresAt);

            const messages: ({ type: 'external', message: Cell } | { type: 'internal', message: Cell, from: Address })[] = [
                {
                    type: 'external',
                    message: DealLocal.queries.externalComplete({
                        targetAddress: deal.address,
                        secretKey: GUARANTOR_KEY_PAIR.secretKey,
                    }),
                },
                {
                    type: 'external',
                    message: DealLocal.queries.externalCancel({
                        targetAddress: deal.address,
                        secretKey: GUARANTOR_KEY_PAIR.secretKey,
                    }),
                },
                {
                    type: 'internal',
                    message: DealLocal.queries.internalCancel({}),
                    from: BUYER,
                },
                {
                    type: 'internal',
                    message: DealLocal.queries.internalCancel({}),
                    from: SELLER,
                },
            ];

            expect.assertions(states.length * messages.length);

            for (const msg of messages) {
                if (msg.type === 'external') {
                    const result = await deal.contract.sendExternalMessage(new ExternalMessage({
                        to: deal.address,
                        body: new CommonMessageInfo({
                            body: new CellMessage(msg.message),
                        })
                    }));

                    expect(result.exit_code).toBe(DealError.notActive);
                } else if (msg.type === 'internal') {
                    const result = await deal.contract.sendInternalMessage(new InternalMessage({
                        to: deal.address,
                        value: new BN(0),
                        bounce: true,
                        body: new CommonMessageInfo({
                            body: new CellMessage(msg.message),
                        }),
                        from: msg.from,
                    }));

                    expect(result.exit_code).toBe(state.expectedInternalError);
                }
            }
        }
    });

    it('should reject cancellation request\'s from unknown addresses', async () => {
        const config = Object.assign({}, defaultConfig);
        config.state = DealState.active;
        const deal = await DealLocal.createFromConfig(config);

        deal.contract.setUnixTime(config.expiresAt);

        const sender = randomAddress();

        const result = await deal.contract.sendInternalMessage(new InternalMessage({
            to: deal.address,
            value: new BN(0),
            bounce: true,
            body: new CommonMessageInfo({
                body: new CellMessage(DealLocal.queries.internalCancel({})),
            }),
            from: sender,
        }));

        expect(result.exit_code).toBe(0xffff);
    });
});

interface WantMsg {
    to: Address
    amount: BN
    body: Cell
    mode: number
}

interface WantReserve {
    mode: number
    amount: BN
}

const checkActions = (list: OutAction[], msgs: WantMsg[], reserves: WantReserve[]) => {
    let oks: boolean[] = [];

    let actsNum = msgs.length + reserves.length;
    if (list.length !== actsNum) {
        throw new Error(`actions count does not match, got ${list.length}, want ${actsNum}: ${JSON.stringify(list, null, 2)}`);
    }

    list.forEach(a => {
        let same = false;

        if (a.type == "send_msg") {
            msgs = msgs.filter(m => { // remove from array if we found same
                let aMsg = a.message.info;
                if (aMsg.type != "internal") {
                    throw new Error()
                }

                if(aMsg.dest?.toFriendly() != m.to.toFriendly()) {
                    return true
                }

                if (a.message.body.hash().compare(m.body.hash()) != 0) {
                    console.log("body not match\n"+a.message.body.toDebugString()+"\n"+m.body.toDebugString())
                    return true
                }

                if (a.mode != m.mode) {
                    console.log("mode not match"+a.mode+" "+m.mode)
                    return true
                }

                if (!aMsg.value.coins.eq(m.amount)) {
                    console.log("amount not match "+aMsg.value.coins+" "+m.amount)
                    return true
                }

                same = true;

                return false
            })
        } else if (a.type == "reserve_currency") {
            reserves = reserves.filter(m => { // remove from array if we found same
                if(a.mode != m.mode) {
                    return true
                }

                if (!a.currency.coins.eq(m.amount)) {
                    return true
                }

                same = true;

                return false
            })
        }

        oks.push(same);
    })

    oks.forEach((o,i) => {
        if (!o) {
            console.error(list[i])
            throw new Error("action not match: "+JSON.stringify(list[i], null, 2))
        }
    })
}