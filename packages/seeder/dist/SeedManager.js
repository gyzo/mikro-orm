"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SeedManager = void 0;
const core_1 = require("@mikro-orm/core");
const fs_extra_1 = require("fs-extra");
const globby_1 = __importDefault(require("globby"));
class SeedManager {
    em;
    config;
    options;
    absolutePath;
    constructor(em) {
        this.em = em;
        this.config = this.em.config;
        this.options = this.config.get('seeder');
        this.em = this.em.fork();
        this.config.set('persistOnCreate', true);
        /* istanbul ignore next */
        const key = (this.config.get('preferTs', core_1.Utils.detectTsNode()) && this.options.pathTs) ? 'pathTs' : 'path';
        this.absolutePath = core_1.Utils.absolutePath(this.options[key], this.config.get('baseDir'));
    }
    static register(orm) {
        orm.config.registerExtension('@mikro-orm/seeder', () => new SeedManager(orm.em));
    }
    async seed(...classNames) {
        for (const SeederClass of classNames) {
            const seeder = new SeederClass();
            await seeder.run(this.em);
            await this.em.flush();
            this.em.clear();
        }
    }
    /**
     * @internal
     */
    async seedString(...classNames) {
        const path = `${this.absolutePath}/${this.options.glob}`;
        const files = await (0, globby_1.default)(path);
        const classMap = new Map();
        for (const path of files) {
            const exports = await core_1.Utils.dynamicImport(path);
            for (const name of Object.keys(exports)) {
                classMap.set(name, exports[name]);
            }
        }
        for (const className of classNames) {
            const seederClass = classMap.get(className);
            if (!seederClass) {
                throw new Error(`Seeder class ${className} not found in ${core_1.Utils.relativePath(path, process.cwd())}`);
            }
            await this.seed(seederClass);
        }
    }
    async createSeeder(className) {
        await this.ensureSeedersDirExists();
        return this.generate(className);
    }
    async ensureSeedersDirExists() {
        await (0, fs_extra_1.ensureDir)(this.absolutePath);
    }
    async generate(className) {
        const fileName = `${this.options.fileName(className)}.${this.options.emit}`;
        const filePath = `${this.absolutePath}/${fileName}`;
        let ret = '';
        if (this.options.emit === 'ts') {
            ret += `import type { EntityManager } from '@mikro-orm/core';\n`;
            ret += `import { Seeder } from '@mikro-orm/seeder';\n\n`;
            ret += `export class ${className} extends Seeder {\n\n`;
            ret += `  async run(em: EntityManager): Promise<void> {}\n\n`;
            ret += `}\n`;
        }
        else {
            ret += `'use strict';\n`;
            ret += `Object.defineProperty(exports, '__esModule', { value: true });\n`;
            ret += `const { Seeder } = require('@mikro-orm/seeder');\n\n`;
            ret += `class ${className} extends Seeder {\n\n`;
            ret += `  async run(em: EntityManager): Promise<void> {}\n\n`;
            ret += `}\n`;
            ret += `exports.${className} = ${className};\n`;
        }
        await (0, fs_extra_1.writeFile)(filePath, ret, { flush: true });
        return filePath;
    }
}
exports.SeedManager = SeedManager;
