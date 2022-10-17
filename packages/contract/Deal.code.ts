import { compileFunc, CompileResult } from '@ton-community/func-js';
import { readFileSync } from 'fs';
import { Cell } from 'ton';

const files = ['stdlib.fc', 'deal.fc'];

let result: CompileResult | null = null;

export const getDealCompileResult = async () => {
    if (result !== null) return result;
    const sources: { [key: string]: string } = {};
    for (const f of files) {
        sources[f] = readFileSync(__dirname + '/sources/' + f).toString();
    }
    result = await compileFunc({
        sources,
        entryPoints: ['deal.fc'],
    });
    return result;
};

let code: Cell | null = null;

export const getDealCodeCell = async () => {
    if (code !== null) return code;

    const compileResult = await getDealCompileResult();
    if (compileResult.status === 'error') {
        throw new Error('could not get compile result: ' + compileResult.message);
    }

    code = Cell.fromBoc(Buffer.from(compileResult.codeBoc, 'base64'))[0];

    return code;
};