"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JSMigrationGenerator = void 0;
const MigrationGenerator_1 = require("./MigrationGenerator");
class JSMigrationGenerator extends MigrationGenerator_1.MigrationGenerator {
    /**
     * @inheritDoc
     */
    generateMigrationFile(className, diff) {
        let ret = `'use strict';\n`;
        ret += `Object.defineProperty(exports, '__esModule', { value: true });\n`;
        ret += `const { Migration } = require('@mikro-orm/migrations-mongodb');\n\n`;
        ret += `class ${className} extends Migration {\n\n`;
        ret += `  async up() {\n`;
        /* istanbul ignore next */
        diff.up.forEach(sql => ret += this.createStatement(sql, 4));
        ret += `  }\n\n`;
        /* istanbul ignore next */
        if (diff.down.length > 0) {
            ret += `  async down() {\n`;
            diff.down.forEach(sql => ret += this.createStatement(sql, 4));
            ret += `  }\n\n`;
        }
        ret += `}\n`;
        ret += `exports.${className} = ${className};\n`;
        return ret;
    }
}
exports.JSMigrationGenerator = JSMigrationGenerator;
