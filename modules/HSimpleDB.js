// this class is designed to reduce repetitive code, simplify common queries, and allow changes to queries to be made easier
// this module was pulled from the Harmony project

import pg from 'pg';

class SimpleDB {
    async init(user, pass, db) {
        this.client = new pg.Client({'user': user, 'password': pass, 'database': db});
        await this.client.connect();
    }
    // pull all data from a column in the database
    async selectCols(table, columns) {
        const result = await this.client.query(`SELECT ${columns} FROM ${table}`);
        return result;
    }

    async selectRow(table, columns, selector, value) {
        const query = `SELECT ${columns} FROM ${table} WHERE ${selector} = $1;`;
        const result = await this.client.query(query, [value]);
        return result.rows[0];
    }
    
    async removeRow(table, selector, value) {
        const query = `DELETE FROM ${table} WHERE ${selector} = $1;`;
        await this.client.query(query, [value]);
    }

    async checkIfTableExists(table) {
        const result = await this.client.query(`SELECT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = '${table}') AS table_existence;`);
        return result.rows[0].table_existence;
    }

    async createTable(table, columns) {
        const result = await this.client.query(`CREATE TABLE ${table}(${columns});`);
        return result;
    }

    async addEntry(table, data) {
        const columns = await this.client.query(`SELECT * FROM ${table} where false;`);
        let columnString = '';
        let valueString = '';
        for (const column in columns.fields) {
            columnString += `${columns.fields[column].name},`;
            valueString += `$${parseInt(column)+1},`;
        }
        columnString = columnString.slice(0, -1);
        valueString = valueString.slice(0, -1);
        const query = `INSERT INTO ${table}(${columnString}) VALUES(${valueString});`;
        const result = await this.client.query(query, data);
        return result;
    }

    async updateEntry(table, primaryKey, primaryKeyValue, columnName, columnValue) {
        const query = `UPDATE ${table} SET ${columnName} = $1 WHERE ${primaryKey} = $2;`;
        const result = await this.client.query(query, [columnValue, primaryKeyValue]);
        return result;
    }
    
    async customQuery(query) {
        const result = await this.client.query(query);
        return result;
    }
}

export { SimpleDB };