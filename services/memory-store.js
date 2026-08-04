import wx from 'wx';
import { createMemoryRepository } from './memory-repository.js';

const repository = createMemoryRepository({
  storage: wx,
  storageKey: 'moment-one:moments:v1',
  maxMoments: 120,
});

export const listMoments = (...args) => repository.listMoments(...args);
export const saveMoment = (...args) => repository.saveMoment(...args);
export const getMoment = (...args) => repository.getMoment(...args);
export const deleteMoment = (...args) => repository.deleteMoment(...args);
export const updateMoment = (...args) => repository.updateMoment(...args);
export const searchMoments = (...args) => repository.searchMoments(...args);
export const clearMoments = (...args) => repository.clearMoments(...args);
