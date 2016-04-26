declare module Triarc.Sqlite {
    class DbInstance {
        private dbName;
        private $rootScope;
        private $q;
        private $logger;
        deviceChangeToken: string;
        private db;
        tables: DbTable<any, any>[];
        private runningQueries;
        private queries;
        private isClosing;
        enableLog: boolean;
        constructor(dbName: string, $rootScope: angular.IRootScopeService, $q: angular.IQService, $logger: IDbLogger, deviceChangeToken: string);
        registerTable(table: DbTable<any, any>): void;
        recreate(): ng.IPromise<any[]>;
        addQuery(query: IExecSqlQuery): void;
        logError(message: string, obj?: any): void;
        logInfo(message: string, obj?: any): void;
        private openDb();
        private runOne();
        private continue();
        private hasQueries();
        private closeDb();
        private continueIfNeeded();
        private run();
        private handleResultAndContinue(dataReader, query);
        private handleErrorAndContinue(err, query);
    }
}
declare module Triarc.Sqlite {
    class DbManager {
        protected $q: angular.IQService;
        protected $rootScope: angular.IRootScopeService;
        private $injector;
        static $inject: string[];
        static serviceId: string;
        private static sqliteDbVersionStorageKey;
        protected static instances: DbInstance[];
        constructor($q: angular.IQService, $rootScope: angular.IRootScopeService, $injector: any);
        static getAllTables(): DbTable<any, any>[];
        static getTables(name?: string): DbTable<any, any>[];
        static printSchema(name?: string): void;
        static printStats(name?: string): void;
        static printSummary(name?: string): void;
        static printRows(name?: string): void;
        static printEntity(tableName: string, id: number): void;
        static execSql(tableName: string, sql: string, stringify?: boolean): void;
        static recreateTable(name?: string): void;
        protected recreateDatabases(): ng.IPromise<any[]>;
        static registerInstance(instance: DbInstance): void;
        hasAnyChanges(): angular.IPromise<boolean>;
        ensureSchema(schemaVersion: number): angular.IPromise<boolean>;
    }
}
declare module Triarc.Sqlite {
    class DbTable<T, TKey> {
        definition: ITableDefinition<T>;
        private $q;
        private static prefix;
        private lastVersion;
        instance: DbInstance;
        constructor(definition: ITableDefinition<T>, $q: angular.IQService);
        initialize(instance: DbInstance): void;
        private execQuery(query);
        private getQuery();
        getSelectQuery(): Sql.SelectQuery;
        private getInsertQuery(dbEntity);
        private getUpdateSql(dbEntity);
        private getDeleteQuery(id);
        private getEntities(conditions?);
        getEntitiesById(ids: TKey[]): angular.IPromise<T[]>;
        printRows(): void;
        printSchema(): void;
        private createTableIfNotExists(dropCreate);
        recreateTable(): angular.IPromise<void>;
        protected applyChangeFlags(dbEntity: any, state: EntityState): void;
        private getIdQueryRepresentation(id);
        private getIdCondition(id);
        deleteEntity(id: TKey): angular.IPromise<void>;
        deleteEntityByFlag(id: TKey): angular.IPromise<void>;
        deleteEntityByFlagWhere(condition: Sql.ICondition): angular.IPromise<void>;
        private updateEntity(newEntity, state);
        addEntity(entity: T): ng.IPromise<any>;
        saveEntities(entities: T[]): angular.IPromise<T[]>;
        saveEntity(entity: T, forcedState?: EntityState): angular.IPromise<T>;
        getEntity(id: TKey): ng.IPromise<T>;
        removeAll(): ng.IPromise<SQLite.IDataReader>;
        count(conditions: Sql.ICondition[]): angular.IPromise<number>;
        hasChanges(): angular.IPromise<boolean>;
    }
}
declare module Triarc.Sqlite {
    enum FieldType {
        Text = 0,
        Numeric = 1,
        Date = 2,
        Boolean = 3,
        JsonObject = 4,
        JsonArray = 5,
        FloatingNumeric = 6,
    }
    interface IFieldDefinition {
        name: string;
        type: FieldType;
        primaryKey?: boolean;
        index?: boolean;
    }
    interface ITableDefinition<T> {
        tableName: string;
        fields: IFieldDefinition[];
        versions: ITableVersion[];
        dbMapper: (dbEntity: any) => T;
        entityMapper: (entity: T) => any;
    }
    interface ITableVersion {
        version: number;
        upMigrationScript: string;
    }
}
declare module Triarc.Sqlite {
    interface IDbLogger {
        info(message: string, obj?: any): any;
        error(message: string, obj?: any): any;
    }
}
declare module Triarc.Sqlite {
    interface IExecSqlQuery {
        query: string | string[];
        params?: any;
        success?: (res: SQLite.IDataReader) => void;
        error?: Function;
    }
}
declare module Triarc.Sqlite {
    enum EntityState {
        unchanged = 0,
        updated = 1,
        deleted = 2,
        added = 3,
    }
}
declare module Triarc.Sqlite.Sql {
    class CreateTableQuery implements IQuery {
        tableQuery: TableQuery;
        fieldDefinitions: IFieldDefinition[];
        constructor(tableQuery: TableQuery);
        fields(...fields: IFieldDefinition[]): this;
        toString(): string;
    }
}
declare module Triarc.Sqlite.Sql {
    class DeleteQuery extends FilterableQuery implements IQuery {
        tableQuery: TableQuery;
        constructor(tableQuery: TableQuery);
        toString(): string;
    }
}
declare module Triarc.Sqlite.Sql {
    class DropTableQuery implements IQuery {
        tableQuery: TableQuery;
        constructor(tableQuery: TableQuery);
        toString(): string;
    }
}
declare module Triarc.Sqlite.Sql {
    class FilterableQuery {
        conditions: ICondition[];
        constructor();
        where(field: string, operator: Operator, value: any): this;
        whereCondition(condition: ICondition): this;
        whereConditions(conditions?: ICondition[]): this;
        toString(): string;
    }
}
declare module Triarc.Sqlite.Sql {
    class InsertQuery implements IQuery {
        tableQuery: TableQuery;
        fieldNames: string[];
        fieldValues: any[];
        constructor(tableQuery: TableQuery);
        fields(...fieldNames: string[]): this;
        values(...fieldValues: any[]): this;
        toString(): string;
    }
}
declare module Triarc.Sqlite.Sql {
    class SelectQuery extends FilterableQuery implements IQuery {
        tableQuery: TableQuery;
        fieldNames: string[];
        offsetValue: number;
        limitValue: number;
        indexedByValue: string;
        orderDescriptors: IOrderDescriptor[];
        constructor(tableQuery: TableQuery);
        fields(...fields: string[]): this;
        orderByFields(...fields: string[]): this;
        orderByFieldsDescending(...fields: string[]): this;
        orderBy(field: string, direction: OrderDirection): this;
        offset(value: number): this;
        limit(value: number): this;
        indexedBy(value: string): this;
        toString(): string;
    }
}
declare module Triarc.Sqlite.Sql {
    interface ICondition {
        field: string;
        operator: Operator;
        value: any;
    }
    interface IQuery {
        toString(): any;
    }
    interface IOrderDescriptor {
        field: string;
        direction: OrderDirection;
    }
    enum OrderDirection {
        ASC = 0,
        DESC = 1,
    }
    enum Operator {
        Equal = 0,
        NotEqual = 1,
        LessThan = 2,
        GreaterThan = 3,
        LessThanOrEqualTo = 4,
        GreaterThanOrEqualTo = 5,
        In = 6,
        NotIn = 7,
    }
    function table(table: string): TableQuery;
    /**
     * Writes an sql condition for the given column equating the value iwth the operator.
     * Can also pass in isString to signify tha that the value can should be wrapped in single quotes.
     *
     * If the value is undefied or null then it will try and be intelligent and just return an empty string.
     * This allows you not to have to write lots of conditional checks to see if values are already null :)
     *
     * @param column Column name to target
     * @param operator Sql operation to perform against the value
     * @param value Value that will be evaluated against the column
     * @param isString Used to determine if the value should be wrapped in quotes
     * @returns {}
     */
    function condition(column: string, operator: Operator, value: any): string;
    function getQueryRepresentation(value: any): string;
    function escapeString(value: string): string;
    /**
     * Writes an AND expression for the given two conditions
     *
     * @param condition1
     * @param condition2
     * @returns {}
     */
    function andExpression(condition1: string, condition2: string): string;
    /**
    * Writes an OR expression for the given two conditions
    *
    * @param condition1
    * @param condition2
    * @returns {}
    */
    function orExpression(condition1: string, condition2: string): string;
    /**
    * Writes an IN expression for the given set of values.
    * The values will be wrapped in quotes if argument isString is true
    *
    * @param condition1
    * @param condition2
    * @returns {}
    */
    function inExpression(columnName: string, values: any[]): string;
    /**
     * Utility function that will prepend an AND expression to the currentCondition if any of the possible conditions have values.
     *
     * If the condition is empty it will jsut return the current condition
     *
     * @param currentCondition
     * @param condition2
     * @param possibleConditions
     * @returns {}
     */
    function andIfNecessary(currentCondition: string, condition: any, ...possibleConditions: any[]): string;
    /**
     * Utility function that will prepend an OR expression to the currentCondition if any of the possible conditions have values.
     *
     * @param currentCondition
     * @param condition2
     * @param possibleConditions
     * @returns {}
     */
    function orIfNecessary(currentCondition: string, condition: any, ...possibleConditions: any[]): string;
    /**
     * Translation for the enum operator to its SQL equivalent
     *
     * @param operator
     * @returns {}
     */
    function operatorString(operator: Operator, queryValue: any): string;
}
declare module Triarc.Sqlite.Sql {
    class TableQuery {
        tableName: string;
        constructor(tableName: string);
        insert(): InsertQuery;
        select(): SelectQuery;
        update(): UpdateQuery;
        delete(): DeleteQuery;
        drop(): DropTableQuery;
        create(): CreateTableQuery;
    }
}
declare module Triarc.Sqlite.Sql {
    class UpdateQuery extends FilterableQuery implements IQuery {
        tableQuery: TableQuery;
        fieldNames: string[];
        fieldValues: any[];
        constructor(tableQuery: TableQuery);
        fields(...fieldNames: string[]): this;
        values(...fieldValues: any[]): this;
        toString(): string;
    }
}
