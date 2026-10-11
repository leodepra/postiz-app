import { encryptLocalToken, decryptTokenFields } from './token-cipher';

// Kept independent of Prisma so write operations can be exercised without a DB.
export async function integrationCipherMiddleware(params: any, next: (params: any) => Promise<any>) {
  if (params.model === 'Integration' && params.args) {
    const protect = (data: any): any => {
      if (!data) return data;
      if (Array.isArray(data)) return data.map(protect);
      const result = { ...data };
      for (const field of ['token', 'refreshToken']) {
        if (typeof result[field] === 'string') result[field] = encryptLocalToken(result[field]);
        else if (result[field]?.set !== undefined) result[field] = { set: encryptLocalToken(result[field].set) };
      }
      return result;
    };
    params = { ...params, args: { ...params.args } };
    for (const field of ['data', 'create', 'update']) {
      if (params.args[field]) params.args[field] = protect(params.args[field]);
    }
  }
  return decryptTokenFields(await next(params));
}
