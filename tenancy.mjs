import { AsyncLocalStorage } from 'node:async_hooks';

const identities = new AsyncLocalStorage();
export const cloudMode = () => process.env.AGENT_MODE === 'cloud';
export function withIdentity(identity, action) { return identities.run(identity, action); }
export function identity() {
  const user = identities.getStore();
  if (cloudMode() && (!user || !/^[a-f0-9-]{36}$/.test(user.id))) throw new Error('需要有效登入');
  return user;
}
export function tenantId() { return identity()?.id ?? 'local'; }
