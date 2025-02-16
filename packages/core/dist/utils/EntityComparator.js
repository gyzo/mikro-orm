"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EntityComparator = void 0;
const clone_1 = require("./clone");
const enums_1 = require("../enums");
const Utils_1 = require("./Utils");
const JsonType_1 = require("../types/JsonType");
const RawQueryFragment_1 = require("./RawQueryFragment");
class EntityComparator {
    metadata;
    platform;
    comparators = new Map();
    mappers = new Map();
    snapshotGenerators = new Map();
    pkGetters = new Map();
    pkGettersConverted = new Map();
    pkSerializers = new Map();
    tmpIndex = 0;
    constructor(metadata, platform) {
        this.metadata = metadata;
        this.platform = platform;
    }
    /**
     * Computes difference between two entities.
     */
    diffEntities(entityName, a, b) {
        const comparator = this.getEntityComparator(entityName);
        return Utils_1.Utils.callCompiledFunction(comparator, a, b);
    }
    matching(entityName, a, b) {
        const diff = this.diffEntities(entityName, a, b);
        return Utils_1.Utils.getObjectKeysSize(diff) === 0;
    }
    /**
     * Removes ORM specific code from entities and prepares it for serializing. Used before change set computation.
     * References will be mapped to primary keys, collections to arrays of primary keys.
     */
    prepareEntity(entity) {
        const generator = this.getSnapshotGenerator(entity.constructor.name);
        return Utils_1.Utils.callCompiledFunction(generator, entity);
    }
    /**
     * Maps database columns to properties.
     */
    mapResult(entityName, result) {
        const mapper = this.getResultMapper(entityName);
        return Utils_1.Utils.callCompiledFunction(mapper, result);
    }
    /**
     * @internal Highly performance-sensitive method.
     */
    getPkGetter(meta) {
        const exists = this.pkGetters.get(meta.className);
        /* istanbul ignore next */
        if (exists) {
            return exists;
        }
        const lines = [];
        const context = new Map();
        if (meta.primaryKeys.length > 1) {
            lines.push(`  const cond = {`);
            meta.primaryKeys.forEach(pk => {
                if (meta.properties[pk].kind !== enums_1.ReferenceKind.SCALAR) {
                    lines.push(`    ${pk}: (entity${this.wrap(pk)} != null && (entity${this.wrap(pk)}.__entity || entity${this.wrap(pk)}.__reference)) ? entity${this.wrap(pk)}.__helper.getPrimaryKey() : entity${this.wrap(pk)},`);
                }
                else {
                    lines.push(`    ${pk}: entity${this.wrap(pk)},`);
                }
            });
            lines.push(`  };`);
            lines.push(`  if (${meta.primaryKeys.map(pk => `cond.${pk} == null`).join(' || ')}) return null;`);
            lines.push(`  return cond;`);
        }
        else {
            const pk = meta.primaryKeys[0];
            if (meta.properties[pk].kind !== enums_1.ReferenceKind.SCALAR) {
                lines.push(`  if (entity${this.wrap(pk)} != null && (entity${this.wrap(pk)}.__entity || entity${this.wrap(pk)}.__reference)) {`);
                lines.push(`    const pk = entity${this.wrap(pk)}.__helper.getPrimaryKey();`);
                if (meta.properties[pk].targetMeta.compositePK) {
                    lines.push(`    if (typeof pk === 'object') {`);
                    lines.push(`      return [`);
                    for (const childPK of meta.properties[pk].targetMeta.primaryKeys) {
                        lines.push(`        pk${this.wrap(childPK)},`);
                    }
                    lines.push(`      ];`);
                    lines.push(`    }`);
                }
                lines.push(`    return pk;`);
                lines.push(`  }`);
            }
            lines.push(`  return entity${this.wrap(pk)};`);
        }
        const code = `// compiled pk serializer for entity ${meta.className}\n`
            + `return function(entity) {\n${lines.join('\n')}\n}`;
        const pkSerializer = Utils_1.Utils.createFunction(context, code);
        this.pkGetters.set(meta.className, pkSerializer);
        return pkSerializer;
    }
    /**
     * @internal Highly performance-sensitive method.
     */
    getPkGetterConverted(meta) {
        const exists = this.pkGettersConverted.get(meta.className);
        /* istanbul ignore next */
        if (exists) {
            return exists;
        }
        const lines = [];
        const context = new Map();
        if (meta.primaryKeys.length > 1) {
            lines.push(`  const cond = {`);
            meta.primaryKeys.forEach(pk => {
                if (meta.properties[pk].kind !== enums_1.ReferenceKind.SCALAR) {
                    lines.push(`    ${pk}: (entity${this.wrap(pk)} != null && (entity${this.wrap(pk)}.__entity || entity${this.wrap(pk)}.__reference)) ? entity${this.wrap(pk)}.__helper.getPrimaryKey(true) : entity${this.wrap(pk)},`);
                }
                else {
                    if (meta.properties[pk].customType) {
                        const convertorKey = this.registerCustomType(meta.properties[pk], context);
                        lines.push(`    ${pk}: convertToDatabaseValue_${convertorKey}(entity${this.wrap(pk)}),`);
                    }
                    else {
                        lines.push(`    ${pk}: entity${this.wrap(pk)},`);
                    }
                }
            });
            lines.push(`  };`);
            lines.push(`  if (${meta.primaryKeys.map(pk => `cond.${pk} == null`).join(' || ')}) return null;`);
            lines.push(`  return cond;`);
        }
        else {
            const pk = meta.primaryKeys[0];
            if (meta.properties[pk].kind !== enums_1.ReferenceKind.SCALAR) {
                lines.push(`  if (entity${this.wrap(pk)} != null && (entity${this.wrap(pk)}.__entity || entity${this.wrap(pk)}.__reference)) return entity${this.wrap(pk)}.__helper.getPrimaryKey(true);`);
            }
            if (meta.properties[pk].customType) {
                const convertorKey = this.registerCustomType(meta.properties[pk], context);
                lines.push(`  return convertToDatabaseValue_${convertorKey}(entity${this.wrap(pk)});`);
            }
            else {
                lines.push(`  return entity${this.wrap(pk)};`);
            }
        }
        const code = `// compiled pk getter (with converted custom types) for entity ${meta.className}\n`
            + `return function(entity) {\n${lines.join('\n')}\n}`;
        const pkSerializer = Utils_1.Utils.createFunction(context, code);
        this.pkGettersConverted.set(meta.className, pkSerializer);
        return pkSerializer;
    }
    /**
     * @internal Highly performance-sensitive method.
     */
    getPkSerializer(meta) {
        const exists = this.pkSerializers.get(meta.className);
        /* istanbul ignore next */
        if (exists) {
            return exists;
        }
        const lines = [];
        const context = new Map();
        context.set('getCompositeKeyValue', (val) => Utils_1.Utils.flatten(Utils_1.Utils.getCompositeKeyValue(val, meta, 'convertToDatabaseValue', this.platform)));
        if (meta.primaryKeys.length > 1) {
            lines.push(`  const pks = entity.__helper.__pk ? getCompositeKeyValue(entity.__helper.__pk) : [`);
            meta.primaryKeys.forEach(pk => {
                if (meta.properties[pk].kind !== enums_1.ReferenceKind.SCALAR) {
                    lines.push(`    (entity${this.wrap(pk)} != null && (entity${this.wrap(pk)}.__entity || entity${this.wrap(pk)}.__reference)) ? entity${this.wrap(pk)}.__helper.getSerializedPrimaryKey() : entity${this.wrap(pk)},`);
                }
                else {
                    lines.push(`    entity${this.wrap(pk)},`);
                }
            });
            lines.push(`  ];`);
            lines.push(`  return pks.join('${Utils_1.Utils.PK_SEPARATOR}');`);
        }
        else {
            const pk = meta.primaryKeys[0];
            if (meta.properties[pk].kind !== enums_1.ReferenceKind.SCALAR) {
                lines.push(`  if (entity${this.wrap(pk)} != null && (entity${this.wrap(pk)}.__entity || entity${this.wrap(pk)}.__reference)) return entity${this.wrap(pk)}.__helper.getSerializedPrimaryKey();`);
            }
            const serializedPrimaryKey = meta.props.find(p => p.serializedPrimaryKey);
            if (serializedPrimaryKey) {
                lines.push(`  return '' + entity.${serializedPrimaryKey.name};`);
            }
            lines.push(`  return '' + entity.${meta.primaryKeys[0]};`);
        }
        const code = `// compiled pk serializer for entity ${meta.className}\n`
            + `return function(entity) {\n${lines.join('\n')}\n}`;
        const pkSerializer = Utils_1.Utils.createFunction(context, code);
        this.pkSerializers.set(meta.className, pkSerializer);
        return pkSerializer;
    }
    /**
     * @internal Highly performance-sensitive method.
     */
    getSnapshotGenerator(entityName) {
        const exists = this.snapshotGenerators.get(entityName);
        if (exists) {
            return exists;
        }
        const meta = this.metadata.find(entityName);
        const lines = [];
        const context = new Map();
        context.set('clone', clone_1.clone);
        context.set('cloneEmbeddable', (o) => this.platform.cloneEmbeddable(o)); // do not clone prototypes
        if (meta.discriminatorValue) {
            lines.push(`  ret${this.wrap(meta.root.discriminatorColumn)} = '${meta.discriminatorValue}'`);
        }
        const getRootProperty = (prop) => prop.embedded ? getRootProperty(meta.properties[prop.embedded[0]]) : prop;
        // copy all comparable props, ignore collections and references, process custom types
        meta.comparableProps
            .filter(prop => {
            const root = getRootProperty(prop);
            return prop === root || root.kind !== enums_1.ReferenceKind.EMBEDDED;
        })
            .forEach(prop => lines.push(this.getPropertySnapshot(meta, prop, context, this.wrap(prop.name), this.wrap(prop.name), [prop.name])));
        const code = `return function(entity) {\n  const ret = {};\n${lines.join('\n')}\n  return ret;\n}`;
        const snapshotGenerator = Utils_1.Utils.createFunction(context, code);
        this.snapshotGenerators.set(entityName, snapshotGenerator);
        return snapshotGenerator;
    }
    /**
     * @internal
     */
    propName(name, parent = 'result') {
        return parent + this.wrap(name);
    }
    /**
     * @internal respects nested composite keys, e.g. `[1, [2, 3]]`
     */
    createCompositeKeyArray(prop, parents = []) {
        if (!prop.targetMeta) {
            let fieldName = prop.fieldNames[0];
            // traverse all parents, mapping my field name to each parent's field name until we reach the root
            for (let i = parents.length - 1; i >= 0; i--) {
                const parent = parents[i];
                // skip m:n since it does not represent any column directly
                if (parent.pivotEntity) {
                    continue;
                }
                const idx = parent.referencedColumnNames.indexOf(fieldName);
                fieldName = parent.fieldNames[idx];
            }
            return this.propName(fieldName);
        }
        const parts = [];
        prop.targetMeta.getPrimaryProps().forEach(pk => {
            const part = this.createCompositeKeyArray(pk, [...parents, prop]);
            parts.push(part);
        });
        return this.formatCompositeKeyPart(parts);
    }
    /**
     * @internal
     */
    formatCompositeKeyPart(part) {
        if (!Array.isArray(part)) {
            return part;
        }
        if (part.length === 1) {
            return this.formatCompositeKeyPart(part[0]);
        }
        const formatted = part.map(this.formatCompositeKeyPart).join(', ');
        return `[${formatted}]`;
    }
    /**
     * @internal Highly performance-sensitive method.
     */
    getResultMapper(entityName) {
        const exists = this.mappers.get(entityName);
        if (exists) {
            return exists;
        }
        const meta = this.metadata.get(entityName);
        const lines = [];
        const context = new Map();
        const tz = this.platform.getTimezone();
        const parseDate = (key, value, padding = '') => {
            lines.push(`${padding}    if (${value} == null || ${value} instanceof Date) {`);
            lines.push(`${padding}      ${key} = ${value};`);
            if (!tz || tz === 'local') {
                lines.push(`${padding}    } else {`);
                lines.push(`${padding}      ${key} = parseDate(${value});`);
            }
            else {
                lines.push(`${padding}    } else if (typeof ${value} === 'number' || ${value}.includes('+') || ${value}.lastIndexOf('-') > 10 || ${value}.endsWith('Z')) {`);
                lines.push(`${padding}      ${key} = parseDate(${value});`);
                lines.push(`${padding}    } else {`);
                lines.push(`${padding}      ${key} = parseDate(${value} + '${tz}');`);
            }
            lines.push(`${padding}    }`);
        };
        lines.push(`  const mapped = {};`);
        meta.props.forEach(prop => {
            if (!prop.fieldNames) {
                return;
            }
            if (prop.targetMeta && prop.fieldNames.length > 1) {
                lines.push(`  if (${prop.fieldNames.map(field => `typeof ${this.propName(field)} === 'undefined'`).join(' && ')}) {`);
                lines.push(`  } else if (${prop.fieldNames.map(field => `${this.propName(field)} != null`).join(' && ')}) {`);
                lines.push(`    ret${this.wrap(prop.name)} = ${this.createCompositeKeyArray(prop)};`);
                lines.push(...prop.fieldNames.map(field => `    ${this.propName(field, 'mapped')} = true;`));
                lines.push(`  } else if (${prop.fieldNames.map(field => `${this.propName(field)} == null`).join(' && ')}) {\n    ret${this.wrap(prop.name)} = null;`);
                lines.push(...prop.fieldNames.map(field => `    ${this.propName(field, 'mapped')} = true;`), '  }');
                return;
            }
            if (prop.embedded && (meta.embeddable || meta.properties[prop.embedded[0]].object)) {
                return;
            }
            if (prop.runtimeType === 'boolean') {
                lines.push(`  if (typeof ${this.propName(prop.fieldNames[0])} !== 'undefined') {`);
                lines.push(`    ret${this.wrap(prop.name)} = ${this.propName(prop.fieldNames[0])} == null ? ${this.propName(prop.fieldNames[0])} : !!${this.propName(prop.fieldNames[0])};`);
                lines.push(`    ${this.propName(prop.fieldNames[0], 'mapped')} = true;`);
                lines.push(`  }`);
            }
            else if (prop.runtimeType === 'Date' && !this.platform.isNumericProperty(prop)) {
                lines.push(`  if (typeof ${this.propName(prop.fieldNames[0])} !== 'undefined') {`);
                context.set('parseDate', (value) => this.platform.parseDate(value));
                parseDate('ret' + this.wrap(prop.name), this.propName(prop.fieldNames[0]));
                lines.push(`    ${this.propName(prop.fieldNames[0], 'mapped')} = true;`);
                lines.push(`  }`);
            }
            else if (prop.kind === enums_1.ReferenceKind.EMBEDDED && (prop.object || meta.embeddable)) {
                const idx = this.tmpIndex++;
                context.set(`mapEmbeddedResult_${idx}`, (data) => {
                    const item = (0, Utils_1.parseJsonSafe)(data);
                    if (Array.isArray(item)) {
                        return item.map(row => row == null ? row : this.getResultMapper(prop.type)(row));
                    }
                    return item == null ? item : this.getResultMapper(prop.type)(item);
                });
                lines.push(`  if (typeof ${this.propName(prop.fieldNames[0])} !== 'undefined') {`);
                lines.push(`    ret${this.wrap(prop.name)} = ${this.propName(prop.fieldNames[0])} == null ? ${this.propName(prop.fieldNames[0])} : mapEmbeddedResult_${idx}(${this.propName(prop.fieldNames[0])});`);
                lines.push(`    ${this.propName(prop.fieldNames[0], 'mapped')} = true;`);
                lines.push(`  }`);
            }
            else if (prop.kind !== enums_1.ReferenceKind.EMBEDDED) {
                lines.push(`  if (typeof ${this.propName(prop.fieldNames[0])} !== 'undefined') {`);
                lines.push(`    ret${this.wrap(prop.name)} = ${this.propName(prop.fieldNames[0])};`);
                lines.push(`    ${this.propName(prop.fieldNames[0], 'mapped')} = true;`);
                lines.push(`  }`);
            }
        });
        lines.push(`  for (let k in result) { if (Object.hasOwn(result, k) && !mapped[k]) ret[k] = result[k]; }`);
        const code = `// compiled mapper for entity ${meta.className}\n`
            + `return function(result) {\n  const ret = {};\n${lines.join('\n')}\n  return ret;\n}`;
        const resultMapper = Utils_1.Utils.createFunction(context, code);
        this.mappers.set(entityName, resultMapper);
        return resultMapper;
    }
    getPropertyCondition(path) {
        const parts = path.slice(); // copy first
        if (parts.length > 1) {
            parts.pop();
        }
        let tail = '';
        return parts
            .map(k => {
            if (k.match(/^\[idx_\d+]$/)) {
                tail += k;
                return '';
            }
            const mapped = `typeof entity${tail ? '.' + tail : ''}${this.wrap(k)} !== 'undefined'`;
            tail += tail ? ('.' + k) : k;
            return mapped;
        })
            .filter(k => k)
            .join(' && ');
    }
    getEmbeddedArrayPropertySnapshot(meta, prop, context, level, path, dataKey) {
        const entityKey = path.map(k => this.wrap(k)).join('');
        const ret = [];
        const padding = ' '.repeat(level * 2);
        const idx = this.tmpIndex++;
        ret.push(`${padding}if (Array.isArray(entity${entityKey})) {`);
        ret.push(`${padding}  ret${dataKey} = [];`);
        ret.push(`${padding}  entity${entityKey}.forEach((_, idx_${idx}) => {`);
        ret.push(this.getEmbeddedPropertySnapshot(meta, prop, context, level + 2, [...path, `[idx_${idx}]`], `${dataKey}[idx_${idx}]`, true));
        ret.push(`${padding}  });`);
        if (this.shouldSerialize(prop, dataKey)) {
            ret.push(`${padding}  ret${dataKey} = cloneEmbeddable(ret${dataKey});`);
        }
        ret.push(`${padding}}`);
        return ret.join('\n');
    }
    /**
     * we need to serialize only object embeddables, and only the top level ones, so root object embeddable
     * properties and first child nested object embeddables with inlined parent
     */
    shouldSerialize(prop, dataKey) {
        dataKey = dataKey.replace(/^\./, '');
        const contains = (str, re) => (str.match(re) || []).length > 0;
        const a = contains(dataKey, /\./g);
        const b = contains(dataKey, /\[/g);
        return !!prop.object && !(a || b);
    }
    getEmbeddedPropertySnapshot(meta, prop, context, level, path, dataKey, object = prop.object) {
        const padding = ' '.repeat(level * 2);
        let ret = `${level === 1 ? '' : '\n'}`;
        if (object) {
            const nullCond = `entity${path.map(k => this.wrap(k)).join('')} === null`;
            ret += `${padding}if (${nullCond}) ret${dataKey} = null;\n`;
        }
        const cond = `entity${path.map(k => this.wrap(k)).join('')} != null`;
        ret += `${padding}if (${cond}) {\n`;
        if (object) {
            ret += `${padding}  ret${dataKey} = {};\n`;
        }
        function shouldProcessCustomType(childProp) {
            if (!childProp.customType) {
                return false;
            }
            if (childProp.customType instanceof JsonType_1.JsonType) {
                return !prop.object;
            }
            return true;
        }
        ret += meta.props.filter(p => p.embedded?.[0] === prop.name
            // object for JSON embeddable
            && (p.object || (p.persist !== false))).map(childProp => {
            const childDataKey = meta.embeddable || prop.object ? dataKey + this.wrap(childProp.embedded[1]) : this.wrap(childProp.name);
            const childEntityKey = [...path, childProp.embedded[1]].map(k => this.wrap(k)).join('');
            const childCond = `typeof entity${childEntityKey} !== 'undefined'`;
            if (childProp.kind === enums_1.ReferenceKind.EMBEDDED) {
                return this.getPropertySnapshot(meta, childProp, context, childDataKey, childEntityKey, [...path, childProp.embedded[1]], level + 1, prop.object);
            }
            if (childProp.kind !== enums_1.ReferenceKind.SCALAR) {
                return this.getPropertySnapshot(meta, childProp, context, childDataKey, childEntityKey, [...path, childProp.embedded[1]], level, prop.object)
                    .split('\n').map(l => padding + l).join('\n');
            }
            if (shouldProcessCustomType(childProp)) {
                const convertorKey = this.registerCustomType(childProp, context);
                if (['number', 'string', 'boolean', 'bigint'].includes(childProp.customType.compareAsType().toLowerCase())) {
                    return `${padding}  if (${childCond}) ret${childDataKey} = convertToDatabaseValue_${convertorKey}(entity${childEntityKey});`;
                }
                return `${padding}  if (${childCond}) ret${childDataKey} = clone(convertToDatabaseValue_${convertorKey}(entity${childEntityKey}));`;
            }
            return `${padding}  if (${childCond}) ret${childDataKey} = clone(entity${childEntityKey});`;
        }).join('\n') + `\n`;
        if (this.shouldSerialize(prop, dataKey)) {
            return `${ret + padding}  ret${dataKey} = cloneEmbeddable(ret${dataKey});\n${padding}}`;
        }
        return `${ret}${padding}}`;
    }
    registerCustomType(prop, context) {
        const convertorKey = this.safeKey(prop.name);
        context.set(`convertToDatabaseValue_${convertorKey}`, (val) => {
            /* istanbul ignore if */
            if (RawQueryFragment_1.RawQueryFragment.isKnownFragment(val)) {
                return val;
            }
            return prop.customType.convertToDatabaseValue(val, this.platform, { mode: 'serialization' });
        });
        return convertorKey;
    }
    getPropertySnapshot(meta, prop, context, dataKey, entityKey, path, level = 1, object) {
        const unwrap = prop.ref ? '?.unwrap()' : '';
        let ret = `  if (${this.getPropertyCondition(path)}) {\n`;
        if (['number', 'string', 'boolean'].includes(prop.type.toLowerCase())) {
            return ret + `    ret${dataKey} = entity${entityKey}${unwrap};\n  }\n`;
        }
        if (prop.kind === enums_1.ReferenceKind.EMBEDDED) {
            if (prop.array) {
                return this.getEmbeddedArrayPropertySnapshot(meta, prop, context, level, path, dataKey) + '\n';
            }
            return this.getEmbeddedPropertySnapshot(meta, prop, context, level, path, dataKey, object) + '\n';
        }
        if (prop.kind === enums_1.ReferenceKind.ONE_TO_ONE || prop.kind === enums_1.ReferenceKind.MANY_TO_ONE) {
            if (prop.mapToPk) {
                if (prop.customType) {
                    const convertorKey = this.registerCustomType(prop, context);
                    ret += `    ret${dataKey} = convertToDatabaseValue_${convertorKey}(entity${entityKey});\n`;
                }
                else {
                    ret += `    ret${dataKey} = entity${entityKey};\n`;
                }
            }
            else {
                const toArray = (val) => {
                    if (Utils_1.Utils.isPlainObject(val)) {
                        return Object.values(val).map(v => toArray(v));
                    }
                    return val;
                };
                context.set('toArray', toArray);
                ret += `    if (entity${entityKey} === null) {\n`;
                ret += `      ret${dataKey} = null;\n`;
                ret += `    } else if (typeof entity${entityKey} !== 'undefined') {\n`;
                ret += `      ret${dataKey} = toArray(entity${entityKey}.__helper.getPrimaryKey(true));\n`;
                ret += `    }\n`;
            }
            return ret + '  }\n';
        }
        if (prop.customType) {
            const convertorKey = this.registerCustomType(prop, context);
            if (['number', 'string', 'boolean', 'bigint'].includes(prop.customType.compareAsType().toLowerCase())) {
                return ret + `    ret${dataKey} = convertToDatabaseValue_${convertorKey}(entity${entityKey}${unwrap});\n  }\n`;
            }
            return ret + `    ret${dataKey} = clone(convertToDatabaseValue_${convertorKey}(entity${entityKey}${unwrap}));\n  }\n`;
        }
        if (prop.runtimeType === 'Date') {
            context.set('processDateProperty', this.platform.processDateProperty.bind(this.platform));
            return ret + `    ret${dataKey} = clone(processDateProperty(entity${entityKey}${unwrap}));\n  }\n`;
        }
        return ret + `    ret${dataKey} = clone(entity${entityKey}${unwrap});\n  }\n`;
    }
    /**
     * @internal Highly performance-sensitive method.
     */
    getEntityComparator(entityName) {
        const exists = this.comparators.get(entityName);
        if (exists) {
            return exists;
        }
        const meta = this.metadata.find(entityName);
        const lines = [];
        const context = new Map();
        context.set('compareArrays', Utils_1.compareArrays);
        context.set('compareBooleans', Utils_1.compareBooleans);
        context.set('compareBuffers', Utils_1.compareBuffers);
        context.set('compareObjects', Utils_1.compareObjects);
        context.set('equals', Utils_1.equals);
        meta.comparableProps.forEach(prop => {
            lines.push(this.getPropertyComparator(prop, context));
        });
        const code = `// compiled comparator for entity ${meta.className}\n`
            + `return function(last, current) {\n  const diff = {};\n${lines.join('\n')}\n  return diff;\n}`;
        const comparator = Utils_1.Utils.createFunction(context, code);
        this.comparators.set(entityName, comparator);
        return comparator;
    }
    getGenericComparator(prop, cond) {
        return `  if (current${prop} == null && last${prop} == null) {\n\n` +
            `  } else if ((current${prop} != null && last${prop} == null) || (current${prop} == null && last${prop} != null)) {\n` +
            `    diff${prop} = current${prop};\n` +
            `  } else if (${cond}) {\n` +
            `    diff${prop} = current${prop};\n` +
            `  }\n`;
    }
    getPropertyComparator(prop, context) {
        let type = prop.type.toLowerCase();
        if (prop.kind !== enums_1.ReferenceKind.SCALAR && prop.kind !== enums_1.ReferenceKind.EMBEDDED) {
            const meta2 = this.metadata.find(prop.type);
            if (meta2.primaryKeys.length > 1) {
                type = 'array';
            }
            else {
                type = meta2.properties[meta2.primaryKeys[0]].type.toLowerCase();
            }
        }
        if (prop.customType) {
            if (prop.customType.compareValues) {
                const idx = this.tmpIndex++;
                context.set(`compareValues_${idx}`, (a, b) => prop.customType.compareValues(a, b));
                return this.getGenericComparator(this.wrap(prop.name), `!compareValues_${idx}(last${this.wrap(prop.name)}, current${this.wrap(prop.name)})`);
            }
            type = prop.customType.compareAsType().toLowerCase();
        }
        if (type.endsWith('[]')) {
            type = 'array';
        }
        if (['string', 'number', 'bigint'].includes(type)) {
            return this.getGenericComparator(this.wrap(prop.name), `last${this.wrap(prop.name)} !== current${this.wrap(prop.name)}`);
        }
        if (type === 'boolean') {
            return this.getGenericComparator(this.wrap(prop.name), `!compareBooleans(last${this.wrap(prop.name)}, current${this.wrap(prop.name)})`);
        }
        if (['array'].includes(type) || type.endsWith('[]')) {
            return this.getGenericComparator(this.wrap(prop.name), `!compareArrays(last${this.wrap(prop.name)}, current${this.wrap(prop.name)})`);
        }
        if (['buffer', 'uint8array'].includes(type)) {
            return this.getGenericComparator(this.wrap(prop.name), `!compareBuffers(last${this.wrap(prop.name)}, current${this.wrap(prop.name)})`);
        }
        if (['date'].includes(type)) {
            return this.getGenericComparator(this.wrap(prop.name), `last${this.wrap(prop.name)}.valueOf() !== current${this.wrap(prop.name)}.valueOf()`);
        }
        if (['objectid'].includes(type)) {
            // We might be comparing PK to object, in case we compare with cached data of populated entity
            // in such case we just ignore the comparison and fallback to `equals()` (which will still mark
            // it as not equal as we compare PK to plain object).
            const cond = `last${this.wrap(prop.name)}.toHexString?.() !== current${this.wrap(prop.name)}.toHexString?.()`;
            return this.getGenericComparator(this.wrap(prop.name), cond);
        }
        return this.getGenericComparator(this.wrap(prop.name), `!equals(last${this.wrap(prop.name)}, current${this.wrap(prop.name)})`);
    }
    wrap(key) {
        if (key.match(/^\[.*]$/)) {
            return key;
        }
        return key.match(/^\w+$/) ? `.${key}` : `['${key}']`;
    }
    safeKey(key) {
        return key.replace(/\W/g, '_');
    }
    /**
     * perf: used to generate list of comparable properties during discovery, so we speed up the runtime comparison
     */
    static isComparable(prop, root) {
        const virtual = prop.persist === false || prop.generated;
        const inverse = prop.kind === enums_1.ReferenceKind.ONE_TO_ONE && !prop.owner;
        const discriminator = prop.name === root.discriminatorColumn;
        const collection = prop.kind === enums_1.ReferenceKind.ONE_TO_MANY || prop.kind === enums_1.ReferenceKind.MANY_TO_MANY;
        return !virtual && !collection && !inverse && !discriminator && !prop.version;
    }
}
exports.EntityComparator = EntityComparator;
