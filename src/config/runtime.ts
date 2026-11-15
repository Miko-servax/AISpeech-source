/** Pages uses the public deployment URL; normal builds default to same-origin APIs. */
import {pagesApiBase} from '../../shared/public-deployment.mjs';
export const apiBase = (import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.MODE === 'pages' ? pagesApiBase : '')).trim();
export const staticPreview = import.meta.env.MODE === 'pages' && !apiBase;
export const modelReviewEnabled = import.meta.env.MODE !== 'pages' && __V8_MODEL_SOURCES__;
export const assetUrl = (path: string) => import.meta.env.BASE_URL + path.replace(/^\/+/, '');
