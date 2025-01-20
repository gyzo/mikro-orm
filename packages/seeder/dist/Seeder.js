"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Seeder = void 0;
class Seeder {
    async call(em, seeders, context = {}) {
        for (const Seeder of seeders) {
            const fork = em.fork();
            const instance = new Seeder();
            await instance.run(fork, context);
            await fork.flush();
        }
    }
}
exports.Seeder = Seeder;
