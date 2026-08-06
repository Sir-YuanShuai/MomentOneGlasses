// 开发态默认构建信息。AIX 打包时由 scripts/pack-aix.mjs 在 staging 目录覆盖，
// 以保证显示的语义版本与 package.json、一包一 UUID 的 VERSION 文件同步。
export const APP_VERSION = '0.3.15';
export const BUILD_ID = 'local-dev';
export const BUILD_LABEL = `v${APP_VERSION} · ${BUILD_ID}`;
