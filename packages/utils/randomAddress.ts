import { randomBytes } from 'crypto';
import { Address } from 'ton';

export const randomAddress = () => new Address(0, randomBytes(32));