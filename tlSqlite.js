var Triarc;
(function (Triarc) {
    var Sqlite;
    (function (Sqlite) {
        var DbInstance = (function () {
            function DbInstance(dbName, $rootScope, $q, $logger, deviceChangeToken) {
                this.dbName = dbName;
                this.$rootScope = $rootScope;
                this.$q = $q;
                this.$logger = $logger;
                this.deviceChangeToken = deviceChangeToken;
                this.db = null;
                this.tables = new Array();
                this.runningQueries = [];
                this.queries = [];
                this.isClosing = false;
                this.enableLog = true;
            }
            DbInstance.prototype.registerTable = function (table) {
                table.initialize(this);
                this.tables.push(table);
            };
            DbInstance.prototype.recreate = function () {
                var promises = [];
                this.tables.forEach(function (t) {
                    promises.add(t.recreateTable());
                });
                return this.$q.all(promises);
            };
            DbInstance.prototype.addQuery = function (query) {
                this.queries.add(query);
                this.run();
            };
            DbInstance.prototype.logError = function (message, obj) {
                if (this.enableLog)
                    this.$logger.error(message, obj);
            };
            DbInstance.prototype.logInfo = function (message, obj) {
                if (this.enableLog)
                    this.$logger.info(message, obj);
            };
            DbInstance.prototype.openDb = function () {
                this.db = window.sqlitePlugin.openDatabase({ name: this.dbName });
            };
            DbInstance.prototype.runOne = function () {
                var _this = this;
                if (!this.hasQueries()) {
                    this.closeDb();
                    return;
                }
                var query = this.queries.first();
                this.queries.removeAt(0);
                this.runningQueries.add(query);
                var queryTime = moment();
                var queries;
                if (angular.isArray(query.query)) {
                    queries = query.query;
                    var amountLeft = queries.length;
                    this.db.transaction(function (tx) {
                        queries.forEach(function (command) {
                            tx.executeSql(command, [], function (txx, res) {
                                amountLeft -= 1;
                                if (amountLeft === 0) {
                                    _this.handleResultAndContinue(res, query);
                                }
                            }, function (tr, err) {
                                amountLeft -= 1;
                                _this.logError("error while executing query " + command, err);
                                if (amountLeft === 0) {
                                    _this.handleErrorAndContinue(err, query);
                                }
                            });
                        });
                        tx.finish();
                    }, function (err) {
                        _this.logError("error while executing transaction " + query.query, err);
                        console.error(err);
                        _this.continue();
                    });
                }
                else {
                    var sqlQuery = query.query;
                    this.db.executeSql(sqlQuery, [], function (res) {
                        var queryTimeMs = moment.duration(moment().diff(queryTime)).asMilliseconds();
                        _this.logInfo("sqlite query took " + queryTimeMs + " ms: query => " + sqlQuery);
                        _this.handleResultAndContinue(res, query);
                    }, function (err) {
                        _this.handleErrorAndContinue(err, query);
                    });
                }
            };
            DbInstance.prototype.continue = function () {
                if (!this.hasQueries() && this.runningQueries.length === 0) {
                    this.closeDb();
                }
                else {
                    this.runOne();
                }
            };
            DbInstance.prototype.hasQueries = function () {
                return this.queries.length > 0;
            };
            DbInstance.prototype.closeDb = function () {
                var _this = this;
                if (this.db === null) {
                    return;
                }
                this.isClosing = true;
                this.db.close(function () {
                    _this.logInfo("db closed: " + _this.dbName);
                    _this.isClosing = false;
                    _this.continueIfNeeded();
                }, function (err) {
                    _this.logError("db closing failed, but db is finally closed: " + _this.dbName, err);
                    _this.isClosing = false;
                    _this.continueIfNeeded();
                });
                this.db = null;
                if (this.queries.length > 0) {
                    this.run();
                }
            };
            DbInstance.prototype.continueIfNeeded = function () {
                if (this.hasQueries()) {
                    this.run();
                }
            };
            DbInstance.prototype.run = function () {
                var needsStart = !angular.isObject(this.db);
                if (needsStart && !this.isClosing) {
                    this.openDb();
                    this.runOne();
                }
            };
            DbInstance.prototype.handleResultAndContinue = function (dataReader, query) {
                this.runningQueries.remove(query);
                if (angular.isFunction(query.success)) {
                    this.$rootScope.$applyAsync(function () { return query.success(dataReader); });
                }
                this.continue();
            };
            DbInstance.prototype.handleErrorAndContinue = function (err, query) {
                this.logError("failed to execute sql query: " + query.query, err);
                this.runningQueries.remove(query);
                if (angular.isFunction(query.error)) {
                    try {
                        this.$rootScope.$applyAsync(function () { return query.error(err); });
                    }
                    catch (e) {
                    }
                }
                this.continue();
            };
            return DbInstance;
        })();
        Sqlite.DbInstance = DbInstance;
    })(Sqlite = Triarc.Sqlite || (Triarc.Sqlite = {}));
})(Triarc || (Triarc = {}));
var Triarc;
(function (Triarc) {
    var Sqlite;
    (function (Sqlite) {
        var DbManager = (function () {
            function DbManager($q, $rootScope, $injector) {
                this.$q = $q;
                this.$rootScope = $rootScope;
                this.$injector = $injector;
            }
            DbManager.getAllTables = function () {
                return DbManager.instances.toEnumerable()
                    .selectMany(function (instance) { return instance.tables; })
                    .toArray();
            };
            DbManager.getTables = function (name) {
                var enumerable = DbManager.getAllTables().toEnumerable();
                if (angular.isString(name)) {
                    enumerable = enumerable.where(function (t) { return t.definition.tableName === name; });
                }
                return enumerable.toArray();
            };
            DbManager.printSchema = function (name) {
                DbManager.getTables(name).forEach(function (t) {
                    t.printSchema();
                });
            };
            DbManager.printStats = function (name) {
                DbManager.getTables(name).forEach(function (t) {
                    t.instance.addQuery({
                        query: "SELECT count(*) AS Count FROM " + t.definition.tableName,
                        success: function (res) {
                            var count = res.rows.item(0);
                            console.log(t.definition.tableName + " => " + count["Count"] + " items");
                        },
                        error: function (err) {
                            console.log('count failed:' + err);
                        }
                    });
                });
            };
            DbManager.printSummary = function (name) {
                DbManager.getTables(name).forEach(function (t) {
                    t.instance.addQuery({
                        query: "SELECT count(*) FROM " + t.definition.tableName,
                        success: function (rows) {
                            for (var index = 0; index < rows.rows.length; index++) {
                                var item = rows.rows.item(index);
                                console.log(t.definition.tableName + " => " + item);
                            }
                        },
                        error: function (err) {
                            console.error("query failed");
                            console.error(err);
                        }
                    });
                });
            };
            DbManager.printRows = function (name) {
                DbManager.getTables(name).forEach(function (t) {
                    t.printRows();
                });
            };
            DbManager.printEntity = function (tableName, id) {
                DbManager.getTables(name).forEach(function (t) {
                    t.getEntity(id).then(function (e) {
                        console.log(tableName + " => " + id, e[0]);
                    }, function (err) { return console.error(err); });
                });
            };
            DbManager.execSql = function (tableName, sql, stringify) {
                if (stringify === void 0) { stringify = false; }
                DbManager.getTables(name).forEach(function (t) {
                    t.instance.addQuery({
                        query: sql,
                        success: function (rows) {
                            console.log("---------- table " + t.definition.tableName + "-----------------");
                            for (var index = 0; index < rows.rows.length; index++) {
                                var item = rows.rows.item(index);
                                if (stringify)
                                    console.log(angular.toJson(item));
                                else
                                    console.log(item);
                            }
                            console.log("----------end of table" + t.definition.tableName + "-----------------");
                        },
                        error: function (err) {
                            console.error("query failed:" + sql);
                            console.error(err);
                        }
                    });
                });
            };
            DbManager.recreateTable = function (name) {
                DbManager.getTables(name).forEach(function (t) {
                    t.recreateTable();
                });
            };
            DbManager.prototype.recreateDatabases = function () {
                var promises = new Array();
                DbManager.instances.forEach(function (instance) {
                    promises.push(instance.recreate());
                });
                return this.$q.all(promises);
            };
            DbManager.registerInstance = function (instance) {
                DbManager.instances.push(instance);
            };
            DbManager.prototype.hasAnyChanges = function () {
                var enumerable = DbManager.getAllTables().toEnumerable();
                return this.$q.all(enumerable.select(function (table) { return table.hasChanges(); }).toArray())
                    .then(function (allChanges) { return allChanges.toEnumerable().any(function (v) { return v; }); });
            };
            DbManager.prototype.ensureSchema = function (schemaVersion) {
                var localSqliteDbVersion = parseInt(localStorage.getItem(DbManager.sqliteDbVersionStorageKey)) || 0;
                if (schemaVersion === localSqliteDbVersion) {
                    console.log("db is up to date");
                    return this.$q.when(false);
                }
                console.log("reset db!");
                //return this.resetDb().then(() => {
                return this.recreateDatabases()
                    .then(function () {
                    localStorage.setItem(DbManager.sqliteDbVersionStorageKey, schemaVersion.toString());
                    return true;
                });
            };
            DbManager.$inject = [
                "$q",
                "$rootScope",
                "$injector"
            ];
            DbManager.serviceId = "DbManager";
            DbManager.sqliteDbVersionStorageKey = "mobileDbVersionStorageKey";
            DbManager.instances = [];
            return DbManager;
        })();
        Sqlite.DbManager = DbManager;
    })(Sqlite = Triarc.Sqlite || (Triarc.Sqlite = {}));
})(Triarc || (Triarc = {}));
var Triarc;
(function (Triarc) {
    var Sqlite;
    (function (Sqlite) {
        var DbTable = (function () {
            function DbTable(definition, $q) {
                this.definition = definition;
                this.$q = $q;
                this.lastVersion = this.definition.versions.toEnumerable()
                    .orderByDescending(function (v) { return v.version; })
                    .firstOrDefault();
            }
            DbTable.prototype.initialize = function (instance) {
                this.instance = instance;
            };
            DbTable.prototype.execQuery = function (query) {
                var deferred = this.$q.defer();
                var queryString;
                if (angular.isArray(query)) {
                    queryString = query.map(function (singleQuery) { return singleQuery.toString(); });
                }
                else {
                    queryString = query.toString();
                }
                this.instance.addQuery({
                    query: queryString,
                    success: function (res) {
                        deferred.resolve(res);
                    },
                    error: function (err) {
                        deferred.reject(err);
                    }
                });
                return deferred.promise;
            };
            DbTable.prototype.getQuery = function () {
                return Sqlite.Sql.table(this.definition.tableName);
            };
            DbTable.prototype.getSelectQuery = function () {
                return Sqlite.Sql.table(this.definition.tableName)
                    .select()
                    .where("__state", Sqlite.Sql.Operator.NotEqual, Sqlite.EntityState.deleted);
            };
            DbTable.prototype.getInsertQuery = function (dbEntity) {
                return (_a = this.getQuery()
                    .insert()).fields.apply(_a, this.definition.fields.map(function (field) { return field.name; }))
                    .values(this.definition.fields.map(function (field) { return dbEntity[field.name]; }));
                var _a;
            };
            DbTable.prototype.getUpdateSql = function (dbEntity) {
                return (_a = this.getQuery()
                    .update()).fields.apply(_a, this.definition.fields.map(function (field) { return field.name; }))
                    .values(this.definition.fields.map(function (field) { return dbEntity[field.name]; }))
                    .where("_id", Sqlite.Sql.Operator.Equal, dbEntity._id);
                var _a;
            };
            DbTable.prototype.getDeleteQuery = function (id) {
                return this.getQuery()
                    .update()
                    .fields("__state")
                    .values(Sqlite.EntityState.deleted)
                    .where("_id", Sqlite.Sql.Operator.Equal, id);
            };
            DbTable.prototype.getEntities = function (conditions) {
                return this.execQuery(this.getQuery().select().whereConditions(conditions));
            };
            DbTable.prototype.getEntitiesById = function (ids) {
                var _this = this;
                ids = ids.toEnumerable().where(function (id) { return id !== null; }).toArray();
                if (!angular.isArray(ids) || ids.length === 0) {
                    return this.$q.when([]);
                }
                return this.execQuery(this.getSelectQuery().where("_id", Sqlite.Sql.Operator.In, ids))
                    .then(function (res) {
                    var result = [];
                    for (var index = 0; index < res.rows.length; index++) {
                        var dataItem = res.rows.item(index);
                        var entity = _this.definition.dbMapper(dataItem);
                        result.add(entity);
                    }
                    return result;
                });
            };
            DbTable.prototype.printRows = function () {
                var _this = this;
                this.instance.addQuery({
                    query: this.getQuery().select().toString(),
                    success: function (res) {
                        console.log("-----------------------------------------------------------");
                        console.log(_this.definition.tableName + '  =>  rows [' + res.rows.length + "]");
                        for (var i = 0; i < res.rows.length; i++) {
                            var item = res.rows.item(i);
                            var line = "";
                            for (var key in item) {
                                line += "    " + key + " => " + item[key];
                            }
                            console.log(line);
                        }
                        console.log("-----------------------------------------------------------");
                    },
                    error: function (err) {
                        console.error(err);
                    }
                });
            };
            DbTable.prototype.printSchema = function () {
                var _this = this;
                this.instance.addQuery({
                    query: "PRAGMA table_info('" + this.definition.tableName + "')",
                    success: function (res) {
                        console.log("PRAGMA result for table " + _this.definition.tableName);
                        for (var i = 0; i < res.rows.length; i++) {
                            var item = res.rows.item(i);
                            var line = "   ";
                            for (var key in item) {
                                line += "    " + key + " => " + item[key];
                            }
                            console.log(line);
                        }
                    },
                    error: function (err) {
                        console.error(err);
                    }
                });
            };
            DbTable.prototype.createTableIfNotExists = function (dropCreate) {
                var _this = this;
                var queries = [];
                if (dropCreate)
                    queries.add(this.getQuery().drop());
                queries.add(this.getQuery().create());
                return this.execQuery(queries)
                    .then(function () {
                    _this.instance.logInfo("table " + _this.definition.tableName + " successfully created");
                })
                    .catch(function (err) {
                    _this.instance.logError("failed to create table " + _this.definition.tableName, err);
                    return _this.$q.reject(err);
                });
            };
            DbTable.prototype.recreateTable = function () {
                return this.createTableIfNotExists(true);
            };
            DbTable.prototype.applyChangeFlags = function (dbEntity, state) {
                dbEntity.__state = state;
                dbEntity._changeToken = this.instance.deviceChangeToken;
                dbEntity.__internalTimestamp = moment().toDate().getTime();
            };
            DbTable.prototype.getIdQueryRepresentation = function (id) {
                return Sqlite.Sql.getQueryRepresentation(id);
            };
            DbTable.prototype.getIdCondition = function (id) {
                return { field: "_id", operator: Sqlite.Sql.Operator.Equal, value: id };
            };
            DbTable.prototype.deleteEntity = function (id) {
                var _this = this;
                return this.execQuery(this.getDeleteQuery(id))
                    .then(function () {
                    _this.instance.logInfo("entity deleted " + id);
                })
                    .catch(function (err) {
                    _this.instance.logError("failed to delete entity " + id, err);
                    return _this.$q.reject(err);
                });
            };
            DbTable.prototype.deleteEntityByFlag = function (id) {
                return this.deleteEntityByFlagWhere(this.getIdCondition(id));
            };
            DbTable.prototype.deleteEntityByFlagWhere = function (condition) {
                var query = Sqlite.Sql
                    .table(this.definition.tableName)
                    .update()
                    .fields("_isDeleted", "__state")
                    .values(true, Sqlite.EntityState.updated)
                    .whereCondition(condition);
                return this.execQuery(query).then(function () { });
            };
            DbTable.prototype.updateEntity = function (newEntity, state) {
                var _this = this;
                var dbEntity = this.definition.entityMapper(newEntity);
                this.applyChangeFlags(dbEntity, state);
                this.execQuery(this.getUpdateSql(dbEntity))
                    .then(function () {
                    return newEntity;
                })
                    .catch(function (err) {
                    _this.instance.logError("update failed", err);
                    return _this.$q.reject(err);
                });
            };
            DbTable.prototype.addEntity = function (entity) {
                var _this = this;
                var value = entity["id"];
                if (!angular.isString(value) || value === "")
                    throw new Error("Wrong usage, id must be set by the caller");
                var dbEntity = this.definition.entityMapper(entity);
                this.applyChangeFlags(dbEntity, Sqlite.EntityState.added);
                return this.execQuery(this.getInsertQuery(dbEntity))
                    .then(function () {
                    return entity;
                })
                    .catch(function (err) {
                    _this.instance.logError("save failed", err);
                    return _this.$q.reject(err);
                });
            };
            DbTable.prototype.saveEntities = function (entities) {
                var _this = this;
                // todo improve multisave
                return this.$q.all(entities.toEnumerable().select(function (e) { return _this.saveEntity(e); }).toArray());
            };
            DbTable.prototype.saveEntity = function (entity, forcedState) {
                var _this = this;
                var id = entity["id"];
                if (angular.isUndefined(id) || id === null) {
                    return this.addEntity(entity);
                }
                var query = this.getQuery()
                    .select()
                    .fields("__state")
                    .whereCondition(this.getIdCondition(id));
                return this.execQuery(query)
                    .then(function (res) {
                    if (res.rows.length > 0) {
                        var state = res.rows.item(0).__state;
                        if (state === Sqlite.EntityState.unchanged) {
                            state = Triarc.hasValue(forcedState) ? forcedState : Sqlite.EntityState.updated;
                        }
                        return _this.updateEntity(entity, state);
                    }
                    return _this.addEntity(entity);
                });
            };
            DbTable.prototype.getEntity = function (id) {
                return this.getEntitiesById([id])
                    .then(function (results) {
                    if (Triarc.arrayHasValues(results)) {
                        return results.toEnumerable().firstOrDefault();
                    }
                    return null;
                });
            };
            DbTable.prototype.removeAll = function () {
                return this.execQuery(this.getQuery().delete());
            };
            DbTable.prototype.count = function (conditions) {
                var query = this.getQuery()
                    .select()
                    .fields("COUNT(*) AS cnt")
                    .where("__state", Sqlite.Sql.Operator.NotEqual, Sqlite.EntityState.deleted)
                    .whereConditions(conditions);
                return this.execQuery(query)
                    .then(function (res) {
                    var item = res.rows.item(0);
                    return item.cnt;
                });
            };
            DbTable.prototype.hasChanges = function () {
                var query = this.getQuery().select()
                    .fields("COUNT(*) AS cnt")
                    .where("__state", Sqlite.Sql.Operator.NotEqual, Sqlite.EntityState.unchanged);
                return this.execQuery(query)
                    .then(function (res) {
                    var item = res.rows.item(0);
                    return item.cnt > 0;
                });
            };
            DbTable.prefix = "TableVersion_";
            return DbTable;
        })();
        Sqlite.DbTable = DbTable;
    })(Sqlite = Triarc.Sqlite || (Triarc.Sqlite = {}));
})(Triarc || (Triarc = {}));
var Triarc;
(function (Triarc) {
    var Sqlite;
    (function (Sqlite) {
        (function (FieldType) {
            FieldType[FieldType["Text"] = 0] = "Text";
            FieldType[FieldType["Numeric"] = 1] = "Numeric";
            FieldType[FieldType["Date"] = 2] = "Date";
            FieldType[FieldType["Boolean"] = 3] = "Boolean";
            FieldType[FieldType["JsonObject"] = 4] = "JsonObject";
            FieldType[FieldType["JsonArray"] = 5] = "JsonArray";
            FieldType[FieldType["FloatingNumeric"] = 6] = "FloatingNumeric";
        })(Sqlite.FieldType || (Sqlite.FieldType = {}));
        var FieldType = Sqlite.FieldType;
    })(Sqlite = Triarc.Sqlite || (Triarc.Sqlite = {}));
})(Triarc || (Triarc = {}));
var Triarc;
(function (Triarc) {
    var Sqlite;
    (function (Sqlite) {
        (function (EntityState) {
            EntityState[EntityState["unchanged"] = 0] = "unchanged";
            EntityState[EntityState["updated"] = 1] = "updated";
            EntityState[EntityState["deleted"] = 2] = "deleted";
            EntityState[EntityState["added"] = 3] = "added";
        })(Sqlite.EntityState || (Sqlite.EntityState = {}));
        var EntityState = Sqlite.EntityState;
    })(Sqlite = Triarc.Sqlite || (Triarc.Sqlite = {}));
})(Triarc || (Triarc = {}));
var Triarc;
(function (Triarc) {
    var Sqlite;
    (function (Sqlite) {
        var Sql;
        (function (Sql) {
            var CreateTableQuery = (function () {
                function CreateTableQuery(tableQuery) {
                    this.tableQuery = tableQuery;
                }
                CreateTableQuery.prototype.fields = function () {
                    var fields = [];
                    for (var _i = 0; _i < arguments.length; _i++) {
                        fields[_i - 0] = arguments[_i];
                    }
                    (_a = this.fieldDefinitions).push.apply(_a, fields);
                    return this;
                    var _a;
                };
                CreateTableQuery.prototype.toString = function () {
                    var fields = this.fieldDefinitions.map(function (field) {
                        var primaryKey = field.primaryKey ? "primary key" : "";
                        return field.name + " " + field.type + " " + primaryKey;
                    }).join(", ");
                    return "CREATE TABLE IF NOT EXISTS " + this.tableQuery.tableName + " (" + fields + "); \t\n\r";
                };
                return CreateTableQuery;
            })();
            Sql.CreateTableQuery = CreateTableQuery;
        })(Sql = Sqlite.Sql || (Sqlite.Sql = {}));
    })(Sqlite = Triarc.Sqlite || (Triarc.Sqlite = {}));
})(Triarc || (Triarc = {}));
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var Triarc;
(function (Triarc) {
    var Sqlite;
    (function (Sqlite) {
        var Sql;
        (function (Sql) {
            var DeleteQuery = (function (_super) {
                __extends(DeleteQuery, _super);
                function DeleteQuery(tableQuery) {
                    _super.call(this);
                    this.tableQuery = tableQuery;
                }
                DeleteQuery.prototype.toString = function () {
                    return "DELETE FROM " + this.tableQuery.tableName + " " + _super.prototype.toString.call(this) + "; \t\n\r";
                };
                return DeleteQuery;
            })(Sql.FilterableQuery);
            Sql.DeleteQuery = DeleteQuery;
        })(Sql = Sqlite.Sql || (Sqlite.Sql = {}));
    })(Sqlite = Triarc.Sqlite || (Triarc.Sqlite = {}));
})(Triarc || (Triarc = {}));
var Triarc;
(function (Triarc) {
    var Sqlite;
    (function (Sqlite) {
        var Sql;
        (function (Sql) {
            var DropTableQuery = (function () {
                function DropTableQuery(tableQuery) {
                    this.tableQuery = tableQuery;
                }
                DropTableQuery.prototype.toString = function () {
                    return "DROP TABLE IF EXISTS " + this.tableQuery.tableName + "; \t\n\r";
                };
                return DropTableQuery;
            })();
            Sql.DropTableQuery = DropTableQuery;
        })(Sql = Sqlite.Sql || (Sqlite.Sql = {}));
    })(Sqlite = Triarc.Sqlite || (Triarc.Sqlite = {}));
})(Triarc || (Triarc = {}));
var Triarc;
(function (Triarc) {
    var Sqlite;
    (function (Sqlite) {
        var Sql;
        (function (Sql) {
            var FilterableQuery = (function () {
                function FilterableQuery() {
                    this.conditions = [];
                }
                FilterableQuery.prototype.where = function (field, operator, value) {
                    return this.whereCondition({ field: field, operator: operator, value: value });
                };
                FilterableQuery.prototype.whereCondition = function (condition) {
                    this.conditions.push(condition);
                    return this;
                };
                FilterableQuery.prototype.whereConditions = function (conditions) {
                    if (conditions)
                        (_a = this.conditions).push.apply(_a, conditions);
                    return this;
                    var _a;
                };
                FilterableQuery.prototype.toString = function () {
                    var condtions = this.conditions.map(function (cond) {
                        return Sql.condition(cond.field, cond.operator, cond.value);
                    }).join(" AND ");
                    if (condtions && condtions.length > 0)
                        condtions = "WHERE " + condtions;
                    return condtions;
                };
                return FilterableQuery;
            })();
            Sql.FilterableQuery = FilterableQuery;
        })(Sql = Sqlite.Sql || (Sqlite.Sql = {}));
    })(Sqlite = Triarc.Sqlite || (Triarc.Sqlite = {}));
})(Triarc || (Triarc = {}));
var Triarc;
(function (Triarc) {
    var Sqlite;
    (function (Sqlite) {
        var Sql;
        (function (Sql) {
            var InsertQuery = (function () {
                function InsertQuery(tableQuery) {
                    this.tableQuery = tableQuery;
                }
                InsertQuery.prototype.fields = function () {
                    var fieldNames = [];
                    for (var _i = 0; _i < arguments.length; _i++) {
                        fieldNames[_i - 0] = arguments[_i];
                    }
                    this.fieldNames = fieldNames;
                    return this;
                };
                InsertQuery.prototype.values = function () {
                    var fieldValues = [];
                    for (var _i = 0; _i < arguments.length; _i++) {
                        fieldValues[_i - 0] = arguments[_i];
                    }
                    this.fieldValues = fieldValues;
                    return this;
                };
                InsertQuery.prototype.toString = function () {
                    var table = this.tableQuery.tableName;
                    var fields = this.fieldNames.join(",");
                    var values = this.fieldValues.map(function (value) { return Sql.getQueryRepresentation(value); });
                    return "INSERT INTO " + table + " (" + fields + ") VALUES (" + values + "); \t\n\r";
                };
                return InsertQuery;
            })();
            Sql.InsertQuery = InsertQuery;
        })(Sql = Sqlite.Sql || (Sqlite.Sql = {}));
    })(Sqlite = Triarc.Sqlite || (Triarc.Sqlite = {}));
})(Triarc || (Triarc = {}));
var Triarc;
(function (Triarc) {
    var Sqlite;
    (function (Sqlite) {
        var Sql;
        (function (Sql) {
            var SelectQuery = (function (_super) {
                __extends(SelectQuery, _super);
                function SelectQuery(tableQuery) {
                    _super.call(this);
                    this.tableQuery = tableQuery;
                    this.fieldNames = [];
                    this.orderDescriptors = [];
                }
                SelectQuery.prototype.fields = function () {
                    var _this = this;
                    var fields = [];
                    for (var _i = 0; _i < arguments.length; _i++) {
                        fields[_i - 0] = arguments[_i];
                    }
                    fields.forEach(function (field) {
                        if (!_this.fieldNames.contains(field))
                            _this.fieldNames.push(field);
                    });
                    return this;
                };
                SelectQuery.prototype.orderByFields = function () {
                    var _this = this;
                    var fields = [];
                    for (var _i = 0; _i < arguments.length; _i++) {
                        fields[_i - 0] = arguments[_i];
                    }
                    fields.map(function (field) { return _this.orderBy(field, Sql.OrderDirection.ASC); });
                    return this;
                };
                SelectQuery.prototype.orderByFieldsDescending = function () {
                    var _this = this;
                    var fields = [];
                    for (var _i = 0; _i < arguments.length; _i++) {
                        fields[_i - 0] = arguments[_i];
                    }
                    fields.map(function (field) { return _this.orderBy(field, Sql.OrderDirection.DESC); });
                    return this;
                };
                SelectQuery.prototype.orderBy = function (field, direction) {
                    this.orderDescriptors.push({ field: field, direction: direction });
                    return this;
                };
                SelectQuery.prototype.offset = function (value) {
                    this.offsetValue = value;
                    return this;
                };
                SelectQuery.prototype.limit = function (value) {
                    this.limitValue = value;
                    return this;
                };
                SelectQuery.prototype.indexedBy = function (value) {
                    this.indexedByValue = value;
                    return this;
                };
                SelectQuery.prototype.toString = function () {
                    var fields = this.fieldNames.join(",");
                    if (!fields || fields.length === 0)
                        fields = "*";
                    var select = "SELECT " + fields;
                    var from = "FROM " + this.tableQuery.tableName;
                    var indexed = "";
                    if (this.indexedByValue)
                        indexed = "INDEXED BY (" + this.indexedByValue + ")";
                    var conditions = _super.prototype.toString.call(this);
                    var order = this.orderDescriptors
                        .map(function (descriptor) { return (descriptor.field + " " + descriptor.direction); })
                        .join(", ");
                    if (order && order.length > 0)
                        order = "ORDER BY " + order;
                    var offset = "";
                    if (this.offsetValue)
                        offset = "OFFSET " + this.offsetValue;
                    var limit = "";
                    if (this.limitValue)
                        limit = "LIMIT " + this.limitValue;
                    var query = [select, from, indexed, conditions, order, offset, limit];
                    return query.join(" ") + "; \t\n\r";
                };
                return SelectQuery;
            })(Sql.FilterableQuery);
            Sql.SelectQuery = SelectQuery;
        })(Sql = Sqlite.Sql || (Sqlite.Sql = {}));
    })(Sqlite = Triarc.Sqlite || (Triarc.Sqlite = {}));
})(Triarc || (Triarc = {}));
var Triarc;
(function (Triarc) {
    var Sqlite;
    (function (Sqlite) {
        var Sql;
        (function (Sql) {
            (function (OrderDirection) {
                OrderDirection[OrderDirection["ASC"] = 0] = "ASC";
                OrderDirection[OrderDirection["DESC"] = 1] = "DESC";
            })(Sql.OrderDirection || (Sql.OrderDirection = {}));
            var OrderDirection = Sql.OrderDirection;
            (function (Operator) {
                Operator[Operator["Equal"] = 0] = "Equal";
                Operator[Operator["NotEqual"] = 1] = "NotEqual";
                Operator[Operator["LessThan"] = 2] = "LessThan";
                Operator[Operator["GreaterThan"] = 3] = "GreaterThan";
                Operator[Operator["LessThanOrEqualTo"] = 4] = "LessThanOrEqualTo";
                Operator[Operator["GreaterThanOrEqualTo"] = 5] = "GreaterThanOrEqualTo";
                Operator[Operator["In"] = 6] = "In";
                Operator[Operator["NotIn"] = 7] = "NotIn";
            })(Sql.Operator || (Sql.Operator = {}));
            var Operator = Sql.Operator;
            function table(table) {
                return new Sql.TableQuery(table);
            }
            Sql.table = table;
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
            function condition(column, operator, value) {
                return column + " " + operatorString(operator, value);
            }
            Sql.condition = condition;
            function getQueryRepresentation(value) {
                if (!value)
                    return "NULL";
                var resultingValue;
                if (angular.isString(value)) {
                    resultingValue = "'" + escapeString(value) + "'";
                }
                else if (angular.isNumber(value)) {
                    resultingValue = value.toString();
                }
                else if (angular.isDate(value)) {
                    resultingValue = value.getTime().toString();
                }
                else if (angular.isObject(value)) {
                    resultingValue = value.toString();
                }
                else {
                    resultingValue = value;
                }
                return resultingValue;
            }
            Sql.getQueryRepresentation = getQueryRepresentation;
            function escapeString(value) {
                return value ? value.replace(/'/g, "''") : "NULL";
            }
            Sql.escapeString = escapeString;
            /**
             * Writes an AND expression for the given two conditions
             *
             * @param condition1
             * @param condition2
             * @returns {}
             */
            function andExpression(condition1, condition2) {
                return " ( " + condition1 + " AND " + condition2 + " ) ";
            }
            Sql.andExpression = andExpression;
            /**
            * Writes an OR expression for the given two conditions
            *
            * @param condition1
            * @param condition2
            * @returns {}
            */
            function orExpression(condition1, condition2) {
                return " ( " + condition1 + " OR " + condition2 + " ) ";
            }
            Sql.orExpression = orExpression;
            /**
            * Writes an IN expression for the given set of values.
            * The values will be wrapped in quotes if argument isString is true
            *
            * @param condition1
            * @param condition2
            * @returns {}
            */
            function inExpression(columnName, values) {
                var idString = values.map(function (val) { return getQueryRepresentation(val); }).join(",");
                return " " + columnName + " IN (" + idString + ") ";
            }
            Sql.inExpression = inExpression;
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
            function andIfNecessary(currentCondition, condition) {
                var possibleConditions = [];
                for (var _i = 2; _i < arguments.length; _i++) {
                    possibleConditions[_i - 2] = arguments[_i];
                }
                if (Triarc.arrayHasValues(possibleConditions) && possibleConditions.toEnumerable().any(function (c) { return Triarc.hasValue(c); })) {
                    currentCondition += " AND ";
                }
                return currentCondition + condition;
            }
            Sql.andIfNecessary = andIfNecessary;
            /**
             * Utility function that will prepend an OR expression to the currentCondition if any of the possible conditions have values.
             *
             * @param currentCondition
             * @param condition2
             * @param possibleConditions
             * @returns {}
             */
            function orIfNecessary(currentCondition, condition) {
                var possibleConditions = [];
                for (var _i = 2; _i < arguments.length; _i++) {
                    possibleConditions[_i - 2] = arguments[_i];
                }
                if (Triarc.arrayHasValues(possibleConditions) && possibleConditions.toEnumerable().any(function (c) { return Triarc.hasValue(c); })) {
                    currentCondition += " OR ";
                }
                return currentCondition + condition;
            }
            Sql.orIfNecessary = orIfNecessary;
            /**
             * Translation for the enum operator to its SQL equivalent
             *
             * @param operator
             * @returns {}
             */
            function operatorString(operator, queryValue) {
                var value = "";
                if (operator === Operator.In || operator === Operator.NotIn) {
                    value = queryValue.forEach(function (value) { return getQueryRepresentation(value); }).join(", ");
                }
                else {
                    value = getQueryRepresentation(queryValue);
                }
                if (!value) {
                    switch (operator) {
                        case Operator.Equal:
                        case Operator.In:
                            return "IS " + value;
                        case Operator.NotEqual:
                        case Operator.NotIn:
                            return "IS NOT " + value;
                    }
                }
                else {
                    switch (operator) {
                        case Operator.Equal:
                            return "= " + value;
                        case Operator.NotEqual:
                            return "!= " + value;
                        case Operator.LessThan:
                            return "< " + value;
                        case Operator.GreaterThan:
                            return "> " + value;
                        case Operator.LessThanOrEqualTo:
                            return "<= " + value;
                        case Operator.GreaterThanOrEqualTo:
                            return ">= " + value;
                        case Operator.In:
                            return "IN (" + value + ")";
                        case Operator.NotIn:
                            return "NOT IN (" + value + ")";
                    }
                }
                throw "Developer error: Unknown SQL Operator!";
            }
            Sql.operatorString = operatorString;
        })(Sql = Sqlite.Sql || (Sqlite.Sql = {}));
    })(Sqlite = Triarc.Sqlite || (Triarc.Sqlite = {}));
})(Triarc || (Triarc = {}));
var Triarc;
(function (Triarc) {
    var Sqlite;
    (function (Sqlite) {
        var Sql;
        (function (Sql) {
            var TableQuery = (function () {
                function TableQuery(tableName) {
                    this.tableName = tableName;
                }
                TableQuery.prototype.insert = function () {
                    return new Sql.InsertQuery(this);
                };
                TableQuery.prototype.select = function () {
                    return new Sql.SelectQuery(this);
                };
                TableQuery.prototype.update = function () {
                    return new Sql.UpdateQuery(this);
                };
                TableQuery.prototype.delete = function () {
                    return new Sql.DeleteQuery(this);
                };
                TableQuery.prototype.drop = function () {
                    return new Sql.DropTableQuery(this);
                };
                TableQuery.prototype.create = function () {
                    return new Sql.CreateTableQuery(this);
                };
                return TableQuery;
            })();
            Sql.TableQuery = TableQuery;
        })(Sql = Sqlite.Sql || (Sqlite.Sql = {}));
    })(Sqlite = Triarc.Sqlite || (Triarc.Sqlite = {}));
})(Triarc || (Triarc = {}));
var Triarc;
(function (Triarc) {
    var Sqlite;
    (function (Sqlite) {
        var Sql;
        (function (Sql) {
            var UpdateQuery = (function (_super) {
                __extends(UpdateQuery, _super);
                function UpdateQuery(tableQuery) {
                    _super.call(this);
                    this.tableQuery = tableQuery;
                }
                UpdateQuery.prototype.fields = function () {
                    var fieldNames = [];
                    for (var _i = 0; _i < arguments.length; _i++) {
                        fieldNames[_i - 0] = arguments[_i];
                    }
                    this.fieldNames = fieldNames;
                    return this;
                };
                UpdateQuery.prototype.values = function () {
                    var fieldValues = [];
                    for (var _i = 0; _i < arguments.length; _i++) {
                        fieldValues[_i - 0] = arguments[_i];
                    }
                    this.fieldValues = fieldValues;
                    return this;
                };
                UpdateQuery.prototype.toString = function () {
                    var _this = this;
                    var table = this.tableQuery.tableName;
                    if (this.fieldNames.length !== this.fieldValues.length)
                        throw new Error("Field name count has to match field value count");
                    var conditions = this.fieldNames.map(function (name, index) {
                        return name + " = " + Sql.getQueryRepresentation(_this.fieldValues[index]);
                    }).join(",");
                    return "UPDATE " + table + " SET " + conditions + " " + _super.prototype.toString.call(this) + "; \t\n\r";
                };
                return UpdateQuery;
            })(Sql.FilterableQuery);
            Sql.UpdateQuery = UpdateQuery;
        })(Sql = Sqlite.Sql || (Sqlite.Sql = {}));
    })(Sqlite = Triarc.Sqlite || (Triarc.Sqlite = {}));
})(Triarc || (Triarc = {}));

