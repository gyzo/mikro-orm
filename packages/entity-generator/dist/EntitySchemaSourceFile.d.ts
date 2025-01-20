import { type Dictionary, type EntityProperty } from '@mikro-orm/core';
import { SourceFile } from './SourceFile';
export declare class EntitySchemaSourceFile extends SourceFile {
    generate(): string;
    private getPropertyOptions;
    protected getPropertyIndexesOptions(prop: EntityProperty, options: Dictionary): void;
    protected getScalarPropertyDecoratorOptions(options: Dictionary, prop: EntityProperty): void;
}
