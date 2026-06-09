import { isApiError } from '@/types/api';

console.assert(isApiError({ ok: false, error: 'nope' }));
console.assert(!isApiError({ ok: true, id: 'x' }));
console.log('api-envelope: ok');
