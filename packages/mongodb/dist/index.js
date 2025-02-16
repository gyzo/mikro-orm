"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ObjectId = exports.defineConfig = exports.MikroORM = exports.EntityRepository = exports.EntityManager = void 0;
/* istanbul ignore file */
__exportStar(require("./MongoConnection"), exports);
__exportStar(require("./MongoDriver"), exports);
__exportStar(require("./MongoPlatform"), exports);
__exportStar(require("./MongoEntityManager"), exports);
__exportStar(require("./MongoEntityRepository"), exports);
__exportStar(require("./MongoSchemaGenerator"), exports);
var MongoEntityManager_1 = require("./MongoEntityManager");
Object.defineProperty(exports, "EntityManager", { enumerable: true, get: function () { return MongoEntityManager_1.MongoEntityManager; } });
var MongoEntityRepository_1 = require("./MongoEntityRepository");
Object.defineProperty(exports, "EntityRepository", { enumerable: true, get: function () { return MongoEntityRepository_1.MongoEntityRepository; } });
var MongoMikroORM_1 = require("./MongoMikroORM");
Object.defineProperty(exports, "MikroORM", { enumerable: true, get: function () { return MongoMikroORM_1.MongoMikroORM; } });
Object.defineProperty(exports, "defineConfig", { enumerable: true, get: function () { return MongoMikroORM_1.defineMongoConfig; } });
var bson_1 = require("bson");
Object.defineProperty(exports, "ObjectId", { enumerable: true, get: function () { return bson_1.ObjectId; } });
__exportStar(require("@mikro-orm/core"), exports);
