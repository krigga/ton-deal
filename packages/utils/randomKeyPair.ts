import { mnemonicToPrivateKey, mnemonicNew } from 'ton-crypto';

export const randomKeyPair = async () => await mnemonicToPrivateKey(await mnemonicNew());