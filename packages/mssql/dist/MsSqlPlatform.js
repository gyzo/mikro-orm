"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MsSqlPlatform = void 0;
const knex_1 = require("@mikro-orm/knex");
// @ts-expect-error no types available
const tsqlstring_1 = __importDefault(require("tsqlstring"));
const MsSqlSchemaHelper_1 = require("./MsSqlSchemaHelper");
const MsSqlExceptionConverter_1 = require("./MsSqlExceptionConverter");
const MsSqlSchemaGenerator_1 = require("./MsSqlSchemaGenerator");
const UnicodeCharacterType_1 = require("./UnicodeCharacterType");
const UnicodeStringType_1 = require("./UnicodeStringType");
class MsSqlPlatform extends knex_1.AbstractSqlPlatform {
    schemaHelper = new MsSqlSchemaHelper_1.MsSqlSchemaHelper(this);
    exceptionConverter = new MsSqlExceptionConverter_1.MsSqlExceptionConverter();
    /** @inheritDoc */
    lookupExtensions(orm) {
        MsSqlSchemaGenerator_1.MsSqlSchemaGenerator.register(orm);
    }
    /** @inheritDoc */
    init(orm) {
        super.init(orm);
        // do not double escape backslash inside strings
        tsqlstring_1.default.CHARS_GLOBAL_REGEXP = /[']/g;
    }
    usesOutputStatement() {
        return true;
    }
    convertDateToJSValue(value) {
        /* istanbul ignore next */
        if (typeof value === 'string') {
            return value;
        }
        return tsqlstring_1.default.dateToString(value.toISOString(), this.timezone ?? 'local').substring(1, 11);
    }
    convertsJsonAutomatically() {
        return false;
    }
    indexForeignKeys() {
        return false;
    }
    supportsSchemas() {
        return true;
    }
    getCurrentTimestampSQL(length) {
        return `current_timestamp`;
    }
    getDateTimeTypeDeclarationSQL(column) {
        /* istanbul ignore next */
        return 'datetime2' + (column.length != null ? `(${column.length})` : '');
    }
    getDefaultDateTimeLength() {
        return 7;
    }
    getFloatDeclarationSQL() {
        return 'float(24)';
    }
    getDoubleDeclarationSQL() {
        return 'float(53)';
    }
    getBooleanTypeDeclarationSQL() {
        return 'bit';
    }
    getRegExpOperator() {
        throw new Error('Not supported');
    }
    getBlobDeclarationSQL() {
        return 'varbinary(max)';
    }
    getJsonDeclarationSQL() {
        return 'nvarchar(max)';
    }
    getVarcharTypeDeclarationSQL(column) {
        if (column.length === -1) {
            return 'varchar(max)';
        }
        return super.getVarcharTypeDeclarationSQL(column);
    }
    getEnumTypeDeclarationSQL(column) {
        if (column.items?.every(item => knex_1.Utils.isString(item))) {
            return knex_1.Type.getType(UnicodeStringType_1.UnicodeStringType).getColumnType({ length: 100, ...column }, this);
        }
        /* istanbul ignore next */
        return this.getSmallIntTypeDeclarationSQL(column);
    }
    normalizeColumnType(type, options = {}) {
        const simpleType = this.extractSimpleType(type);
        if (['decimal', 'numeric'].includes(simpleType)) {
            return this.getDecimalTypeDeclarationSQL(options);
        }
        if (['real'].includes(simpleType)) {
            return this.getFloatDeclarationSQL();
        }
        return super.normalizeColumnType(type, options);
    }
    getDefaultMappedType(type) {
        if (type.startsWith('float')) {
            const len = type.match(/float\((\d+)\)/)?.[1] ?? 24;
            return +len > 24 ? knex_1.Type.getType(knex_1.DoubleType) : knex_1.Type.getType(knex_1.FloatType);
        }
        const normalizedType = this.extractSimpleType(type);
        if (normalizedType !== 'uuid' && ['string', 'nvarchar'].includes(normalizedType)) {
            return knex_1.Type.getType(UnicodeStringType_1.UnicodeStringType);
        }
        if (['character', 'nchar'].includes(normalizedType)) {
            return knex_1.Type.getType(UnicodeCharacterType_1.UnicodeCharacterType);
        }
        const map = {
            int: 'integer',
            bit: 'boolean',
            real: 'float',
            uniqueidentifier: 'uuid',
            varbinary: 'blob',
            datetime2: 'datetime',
            smalldatetime: 'datetime',
        };
        return super.getDefaultMappedType(map[normalizedType] ?? type);
    }
    getDefaultSchemaName() {
        return 'dbo';
    }
    getUuidTypeDeclarationSQL(column) {
        return 'uniqueidentifier';
    }
    validateMetadata(meta) {
        for (const prop of meta.props) {
            if ((prop.runtimeType === 'string' || ['string', 'nvarchar'].includes(prop.type))
                && !['uuid'].includes(prop.type)
                && !prop.columnTypes[0].startsWith('varchar')) {
                prop.customType ??= new UnicodeStringType_1.UnicodeStringType();
                prop.customType.prop = prop;
                prop.customType.platform = this;
                prop.customType.meta = meta;
            }
        }
    }
    getSearchJsonPropertyKey(path, type, aliased, value) {
        const [a, ...b] = path;
        /* istanbul ignore next */
        const root = this.quoteIdentifier(aliased ? `${knex_1.ALIAS_REPLACEMENT}.${a}` : a);
        const types = {
            boolean: 'bit',
        };
        const cast = (key) => (0, knex_1.raw)(type in types ? `cast(${key} as ${types[type]})` : key);
        const quoteKey = (key) => key.match(/^[a-z]\w*$/i) ? key : `"${key}"`;
        /* istanbul ignore if */
        if (path.length === 0) {
            return cast(`json_value(${root}, '$.${b.map(quoteKey).join('.')}')`);
        }
        return cast(`json_value(${root}, '$.${b.map(quoteKey).join('.')}')`);
    }
    normalizePrimaryKey(data) {
        /* istanbul ignore if */
        if (data instanceof UnicodeStringType_1.UnicodeString) {
            return data.value;
        }
        return data;
    }
    supportsMultipleCascadePaths() {
        return false;
    }
    supportsMultipleStatements() {
        return true;
    }
    quoteIdentifier(id) {
        return `[${id.replace('.', `].[`)}]`;
    }
    escape(value) {
        if (value instanceof UnicodeStringType_1.UnicodeString) {
            return `N${tsqlstring_1.default.escape(value.value)}`;
        }
        if (value instanceof Buffer) {
            return `0x${value.toString('hex')}`;
        }
        if (value instanceof Date) {
            return tsqlstring_1.default.dateToString(value.toISOString(), this.timezone ?? 'local');
        }
        return tsqlstring_1.default.escape(value);
    }
    /* istanbul ignore next: kept for type inference only */
    getSchemaGenerator(driver, em) {
        return new MsSqlSchemaGenerator_1.MsSqlSchemaGenerator(em ?? driver);
    }
    allowsComparingTuples() {
        return false;
    }
}
exports.MsSqlPlatform = MsSqlPlatform;
