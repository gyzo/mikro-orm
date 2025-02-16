"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EntityMetadata = exports.Config = exports.HiddenProps = exports.EagerProps = exports.OptionalProps = exports.PrimaryKeyProp = exports.EntityRepositoryType = void 0;
const enums_1 = require("./enums");
const entity_1 = require("./entity");
const Utils_1 = require("./utils/Utils");
const EntityComparator_1 = require("./utils/EntityComparator");
exports.EntityRepositoryType = Symbol('EntityRepositoryType');
exports.PrimaryKeyProp = Symbol('PrimaryKeyProp');
exports.OptionalProps = Symbol('OptionalProps');
exports.EagerProps = Symbol('EagerProps');
exports.HiddenProps = Symbol('HiddenProps');
exports.Config = Symbol('Config');
class EntityMetadata {
    static counter = 0;
    _id = 1000 * EntityMetadata.counter++; // keep the id >= 1000 to allow computing cache keys by simple addition
    propertyOrder = new Map();
    constructor(meta = {}) {
        this.properties = {};
        this.props = [];
        this.primaryKeys = [];
        this.filters = {};
        this.hooks = {};
        this.indexes = [];
        this.uniques = [];
        this.checks = [];
        this.referencingProperties = [];
        this.concurrencyCheckKeys = new Set();
        Object.assign(this, meta);
    }
    addProperty(prop, sync = true) {
        if (prop.pivotTable && !prop.pivotEntity) {
            prop.pivotEntity = prop.pivotTable;
        }
        this.properties[prop.name] = prop;
        this.propertyOrder.set(prop.name, this.props.length);
        /* istanbul ignore next */
        if (sync) {
            this.sync();
        }
    }
    removeProperty(name, sync = true) {
        delete this.properties[name];
        this.propertyOrder.delete(name);
        /* istanbul ignore next */
        if (sync) {
            this.sync();
        }
    }
    getPrimaryProps() {
        return this.primaryKeys.map(pk => this.properties[pk]);
    }
    getPrimaryProp() {
        return this.properties[this.primaryKeys[0]];
    }
    get tableName() {
        return this.collection;
    }
    set tableName(name) {
        this.collection = name;
    }
    sync(initIndexes = false) {
        this.root ??= this;
        const props = Object.values(this.properties).sort((a, b) => this.propertyOrder.get(a.name) - this.propertyOrder.get(b.name));
        this.props = [...props.filter(p => p.primary), ...props.filter(p => !p.primary)];
        this.relations = this.props.filter(prop => typeof prop.kind !== 'undefined' && prop.kind !== enums_1.ReferenceKind.SCALAR && prop.kind !== enums_1.ReferenceKind.EMBEDDED);
        this.bidirectionalRelations = this.relations.filter(prop => prop.mappedBy || prop.inversedBy);
        this.uniqueProps = this.props.filter(prop => prop.unique);
        this.getterProps = this.props.filter(prop => prop.getter);
        this.comparableProps = this.props.filter(prop => EntityComparator_1.EntityComparator.isComparable(prop, this));
        this.hydrateProps = this.props.filter(prop => {
            // `prop.userDefined` is either `undefined` or `false`
            const discriminator = this.root.discriminatorColumn === prop.name && prop.userDefined === false;
            // even if we don't have a setter, do not ignore value from database!
            const onlyGetter = prop.getter && !prop.setter;
            return !prop.inherited && prop.hydrate !== false && !discriminator && !prop.embedded && !onlyGetter;
        });
        this.trackingProps = this.hydrateProps
            .filter(prop => !prop.getter && !prop.setter && prop.trackChanges !== false)
            .filter(prop => ![enums_1.ReferenceKind.ONE_TO_MANY, enums_1.ReferenceKind.MANY_TO_MANY].includes(prop.kind))
            .filter(prop => !prop.serializedPrimaryKey);
        this.selfReferencing = this.relations.some(prop => [this.className, this.root.className].includes(prop.targetMeta?.root.className ?? prop.type));
        this.hasUniqueProps = this.uniques.length + this.uniqueProps.length > 0;
        this.virtual = !!this.expression;
        this.checks = Utils_1.Utils.removeDuplicates(this.checks);
        this.indexes = Utils_1.Utils.removeDuplicates(this.indexes);
        this.uniques = Utils_1.Utils.removeDuplicates(this.uniques);
        for (const hook of Utils_1.Utils.keys(this.hooks)) {
            this.hooks[hook] = Utils_1.Utils.removeDuplicates(this.hooks[hook]);
        }
        if (this.virtual) {
            this.readonly = true;
        }
        if (initIndexes && this.name) {
            this.props.forEach(prop => this.initIndexes(prop));
        }
        this.definedProperties = this.trackingProps.reduce((o, prop) => {
            const isCollection = [enums_1.ReferenceKind.ONE_TO_MANY, enums_1.ReferenceKind.MANY_TO_MANY].includes(prop.kind);
            const isReference = [enums_1.ReferenceKind.ONE_TO_ONE, enums_1.ReferenceKind.MANY_TO_ONE].includes(prop.kind) && (prop.inversedBy || prop.mappedBy) && !prop.mapToPk;
            if (isReference) {
                // eslint-disable-next-line @typescript-eslint/no-this-alias
                const meta = this;
                o[prop.name] = {
                    get() {
                        return this.__helper.__data[prop.name];
                    },
                    set(val) {
                        const wrapped = this.__helper;
                        const hydrator = wrapped.hydrator;
                        const entity = entity_1.Reference.unwrapReference(val ?? wrapped.__data[prop.name]);
                        const old = entity_1.Reference.unwrapReference(wrapped.__data[prop.name]);
                        wrapped.__data[prop.name] = entity_1.Reference.wrapReference(val, prop);
                        // when propagation from inside hydration, we set the FK to the entity data immediately
                        if (val && hydrator.isRunning() && wrapped.__originalEntityData && prop.owner) {
                            wrapped.__originalEntityData[prop.name] = Utils_1.Utils.getPrimaryKeyValues(val, prop.targetMeta.primaryKeys, true);
                        }
                        else {
                            wrapped.__touched = !hydrator.isRunning();
                        }
                        entity_1.EntityHelper.propagate(meta, entity, this, prop, entity_1.Reference.unwrapReference(val), old);
                    },
                    enumerable: true,
                    configurable: true,
                };
            }
            if (prop.inherited || prop.primary || isCollection || prop.persist === false || prop.trackChanges === false || isReference || prop.embedded) {
                return o;
            }
            o[prop.name] = {
                get() {
                    return this.__helper.__data[prop.name];
                },
                set(val) {
                    if (typeof val === 'object' && !!val && '__raw' in val) {
                        val.assign();
                    }
                    this.__helper.__data[prop.name] = val;
                    this.__helper.__touched = !this.__helper.hydrator.isRunning();
                },
                enumerable: true,
                configurable: true,
            };
            return o;
        }, { __gettersDefined: { value: true, enumerable: false } });
    }
    initIndexes(prop) {
        const simpleIndex = this.indexes.find(index => index.properties === prop.name && !index.options && !index.type && !index.expression);
        const simpleUnique = this.uniques.find(index => index.properties === prop.name && !index.options);
        const owner = prop.kind === enums_1.ReferenceKind.MANY_TO_ONE;
        if (!prop.index && simpleIndex) {
            Utils_1.Utils.defaultValue(simpleIndex, 'name', true);
            prop.index = simpleIndex.name;
            this.indexes.splice(this.indexes.indexOf(simpleIndex), 1);
        }
        if (!prop.unique && simpleUnique) {
            Utils_1.Utils.defaultValue(simpleUnique, 'name', true);
            prop.unique = simpleUnique.name;
            this.uniques.splice(this.uniques.indexOf(simpleUnique), 1);
        }
        if (prop.index && owner && prop.fieldNames.length > 1) {
            this.indexes.push({ properties: prop.name });
            prop.index = false;
        }
        /* istanbul ignore next */
        if (owner && prop.fieldNames.length > 1 && prop.unique) {
            this.uniques.push({ properties: prop.name });
            prop.unique = false;
        }
    }
    /** @internal */
    clone() {
        return this;
    }
}
exports.EntityMetadata = EntityMetadata;
