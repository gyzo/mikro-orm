"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EntitySchemaSourceFile = void 0;
const core_1 = require("@mikro-orm/core");
const SourceFile_1 = require("./SourceFile");
class EntitySchemaSourceFile extends SourceFile_1.SourceFile {
    generate() {
        let classBody = '';
        if (this.meta.className === this.options.customBaseEntityName) {
            const defineConfigTypeSettings = {};
            defineConfigTypeSettings.forceObject = this.platform.getConfig().get('serialization').forceObject ?? false;
            classBody += `${' '.repeat(2)}[${this.referenceCoreImport('Config')}]?: ${this.referenceCoreImport('DefineConfig')}<${this.serializeObject(defineConfigTypeSettings)}>;\n`;
        }
        const enumDefinitions = [];
        const eagerProperties = [];
        const primaryProps = [];
        const props = [];
        for (const prop of Object.values(this.meta.properties)) {
            props.push(this.getPropertyDefinition(prop, 2));
            if (prop.enum && (typeof prop.kind === 'undefined' || prop.kind === core_1.ReferenceKind.SCALAR)) {
                enumDefinitions.push(this.getEnumClassDefinition(prop, 2));
            }
            if (prop.eager) {
                eagerProperties.push(prop);
            }
            if (prop.primary && (!['id', '_id', 'uuid'].includes(prop.name) || this.meta.compositePK)) {
                primaryProps.push(prop);
            }
        }
        if (primaryProps.length > 0) {
            const primaryPropNames = primaryProps.map(prop => `'${prop.name}'`);
            if (primaryProps.length > 1) {
                classBody += `${' '.repeat(2)}[${this.referenceCoreImport('PrimaryKeyProp')}]?: [${primaryPropNames.join(', ')}];\n`;
            }
            else {
                classBody += `${' '.repeat(2)}[${this.referenceCoreImport('PrimaryKeyProp')}]?: ${primaryPropNames[0]};\n`;
            }
        }
        if (eagerProperties.length > 0) {
            const eagerPropertyNames = eagerProperties.map(prop => `'${prop.name}'`).sort();
            classBody += `${' '.repeat(2)}[${this.referenceCoreImport('EagerProps')}]?: ${eagerPropertyNames.join(' | ')};\n`;
        }
        classBody += `${props.join('')}`;
        let ret = this.getEntityClass(classBody);
        if (enumDefinitions.length) {
            ret += '\n' + enumDefinitions.join('\n');
        }
        ret += `\n`;
        const entitySchemaOptions = {
            class: this.meta.className,
            ...(this.meta.embeddable ? this.getEmbeddableDeclOptions() : (this.meta.collection ? this.getEntityDeclOptions() : {})),
        };
        const declLine = `export const ${this.meta.className}Schema = new ${this.referenceCoreImport('EntitySchema')}(`;
        ret += declLine;
        if (this.meta.indexes.length > 0) {
            entitySchemaOptions.indexes = this.meta.indexes.map(index => this.getIndexOptions(index));
        }
        if (this.meta.uniques.length > 0) {
            entitySchemaOptions.uniques = this.meta.uniques.map(index => this.getUniqueOptions(index));
        }
        entitySchemaOptions.properties = Object.fromEntries(Object.entries(this.meta.properties).map(([name, prop]) => [name, this.getPropertyOptions(prop)]));
        // Force top level and properties to be indented, regardless of line length
        entitySchemaOptions[core_1.Config] = true;
        entitySchemaOptions.properties[core_1.Config] = true;
        ret += this.serializeObject(entitySchemaOptions, declLine.length > 80 ? undefined : 80 - declLine.length, 0);
        ret += ');\n';
        ret = `${this.generateImports()}\n\n${ret}`;
        return ret;
    }
    getPropertyOptions(prop) {
        const options = {};
        if (prop.primary) {
            options.primary = true;
        }
        if (typeof prop.kind !== 'undefined' && prop.kind !== core_1.ReferenceKind.SCALAR) {
            options.kind = this.quote(prop.kind);
        }
        if (prop.kind === core_1.ReferenceKind.MANY_TO_MANY) {
            this.getManyToManyDecoratorOptions(options, prop);
        }
        else if (prop.kind === core_1.ReferenceKind.ONE_TO_MANY) {
            this.getOneToManyDecoratorOptions(options, prop);
        }
        else if (prop.kind === core_1.ReferenceKind.SCALAR || typeof prop.kind === 'undefined') {
            this.getScalarPropertyDecoratorOptions(options, prop);
        }
        else if (prop.kind === core_1.ReferenceKind.EMBEDDED) {
            this.getEmbeddedPropertyDeclarationOptions(options, prop);
        }
        else {
            this.getForeignKeyDecoratorOptions(options, prop);
        }
        if (prop.formula) {
            options.formula = `${prop.formula}`;
        }
        this.getCommonDecoratorOptions(options, prop);
        this.getPropertyIndexesOptions(prop, options);
        return options;
    }
    getPropertyIndexesOptions(prop, options) {
        if (prop.kind === core_1.ReferenceKind.SCALAR) {
            if (prop.index) {
                options.index = this.quote(prop.index);
            }
            if (prop.unique) {
                options.unique = this.quote(prop.unique);
            }
            return;
        }
        const processIndex = (type) => {
            const propType = prop[type];
            if (!propType) {
                return;
            }
            const defaultName = this.platform.getIndexName(this.meta.collection, prop.fieldNames, type);
            /* istanbul ignore next */
            options[type] = (propType === true || defaultName === propType) ? 'true' : this.quote(propType);
            const expected = {
                index: this.platform.indexForeignKeys(),
                unique: prop.kind === core_1.ReferenceKind.ONE_TO_ONE,
            };
            if (expected[type] && options[type] === 'true') {
                delete options[type];
            }
        };
        processIndex('index');
        processIndex('unique');
    }
    getScalarPropertyDecoratorOptions(options, prop) {
        if (prop.enum) {
            options.enum = true;
            options.items = `() => ${prop.runtimeType}`;
        }
        else {
            options.type = this.quote(prop.type);
        }
        super.getScalarPropertyDecoratorOptions(options, prop);
    }
}
exports.EntitySchemaSourceFile = EntitySchemaSourceFile;
