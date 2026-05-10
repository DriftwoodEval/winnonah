import { EventEmitter } from "node:events";

export const SERVER_START_TIME = Date.now();

export const systemEmitter = new EventEmitter();
systemEmitter.setMaxListeners(100);
