"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FullTextType = void 0;
const core_1 = require("@mikro-orm/core");
class FullTextType extends core_1.Type {
    regconfig;
    constructor(regconfig = 'simple') {
        super();
        this.regconfig = regconfig;
    }
    compareAsType() {
        return 'any';
    }
    getColumnType() {
        return 'tsvector';
    }
    // Use convertToDatabaseValue to prepare insert queries as this method has
    // access to the raw JS value. Return Knex#raw to prevent QueryBuilderHelper#mapData
    // from sanitizing the returned chaing of SQL functions.
    convertToDatabaseValue(value, platform, context) {
        // Don't convert to values from select queries to the to_tsvector notation
        // these should be compared as string using a special oparator or function
        // this behaviour is defined in Platform#getFullTextWhereClause.
        // This is always a string.
        if (typeof context === 'object' && context.fromQuery) {
            return value;
        }
        // Null values should not be processed
        if (!value) {
            return null;
        }
        // the object from that looks like { A: 'test data', B: 'test data2' ... }
        // must be converted to
        // setweight(to_tsvector(regconfig, value), A) || setweight(to_tsvector(regconfig, value), B)... etc
        // use Knex#raw to do binding of the values sanitization of the boundvalues
        // as we return a raw string which should not be sanitzed anymore
        if (typeof value === 'object') {
            const bindings = [];
            const sqlParts = [];
            for (const [weight, data] of Object.entries(value)) {
                // Check whether the weight is valid according to Postgres,
                // Postgres allows the weight to be upper and lowercase.
                if (!['A', 'B', 'C', 'D'].includes(weight.toUpperCase())) {
                    throw new Error('Weight should be one of A, B, C, D.');
                }
                // Ignore all values that are not a string
                if (typeof data === 'string') {
                    sqlParts.push('setweight(to_tsvector(?, ?), ?)');
                    bindings.push(this.regconfig, data, weight);
                }
            }
            // Return null if the object has no valid strings
            if (sqlParts.length === 0) {
                return null;
            }
            // Join all the `setweight` parts using the PostgreSQL tsvector `||` concatenation operator
            return (0, core_1.raw)(sqlParts.join(' || '), bindings);
        }
        // if it's not an object, it is expected to be string which does not have to be wrapped in setweight.
        return (0, core_1.raw)('to_tsvector(?, ?)', [this.regconfig, value]);
    }
}
exports.FullTextType = FullTextType;
