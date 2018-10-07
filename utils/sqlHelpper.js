
var mysql = require('mysql');
var config = require("../config/config")

var async = require("async");

//连接ｍｙｓｑｌ时不需要加端口
var pool = mysql.createPool(config.mysql);

module.exports = {
    query: async (sql, params) => {
        //通过创建ｐｒｏｍｉｓｅ去实现同步，调用resolve是触发成功的回调方法，调用reject是触发失败的方法
        let promise = new Promise((resolve, reject) => {
            pool.getConnection(function (err, connection) {
                if (err) {
                    reject(err)
                } else {
                    connection.query(sql, params, function (error, results, fields) {
                        
                        console.log(`\n${sql}\n${params}`)

                        if (error) {
                            reject(error)
                        } else {
                            resolve(results)
                        }
                        connection.release();
                    });
                }
    
            });
        })
    
        let result;
        //第一个参数是成功的回调
        //第二个参数是失败的回调
        await promise.then(function (data) {
            result = {error:null, data:data}
        }, function(error) {
            console.log("sql ERROR:"+error)
            result = {error:error, data:null}
        })
        
        console.log(JSON.stringify(result))
        return result
    },

    executionTransactions:async (sqlParams) => {
        let promise = new Promise((resolve, reject) => {
            poolExecutionTransaction(sqlParams, function (err, data) {
                if (err) {
                    console.log('err:' + err)
                    reject(err)
                } else {
                    resolve(data)
                }
    
            })
        })
    
        let result;
        await promise.then(function (data) {
            result = { "error": null, "data": data }
        }, function (error) {
            result = { "error": error, "data": null }
        })
        console.log(JSON.stringify(result))
        return result
    }

}

function poolExecutionTransaction(sqlparams, callback) {
    pool.getConnection(function (err, connection) {
        if (err) {
            console.log(err)
            return callback(err, null);
        }
        connection.beginTransaction(function (err) {
            if (err) {
                console.log(err)
                return callback(err, null);
            }
            console.log("开始执行transaction，共执行" + sqlparams.length + "条数据");
            var funcAry = [];
            sqlparams.forEach(function (sql_param) {
                var temp = function (cb) {
                    var sql = sql_param.sql;
                    var param = sql_param.params;
                    connection.query(sql, param, function (tErr, rows, fields) {
                        if (tErr) {
                            connection.rollback(function () {
                                console.log("事务失败，" + sql_param + "，ERROR：" + tErr);
                                throw tErr;
                            });
                        } else {
                            return cb(null, 'ok');
                        }
                    })
                };
                funcAry.push(temp);
            });

            async.series(funcAry, function (err, result) {
                if (err) {
                    console.log("async.series error: " + err);
                    connection.rollback(function (err) {
                        console.log("connection.rollback error: " + err);
                        connection.release();
                        return callback(err, null);
                    });
                } else {
                    connection.commit(function (err, info) {
                        if (err) {
                            console.log("执行事务失败，" + err);
                            connection.rollback(function (err) {
                                console.log("connection.rollback error: " + err);
                                connection.release();
                                return callback(err, null);
                            });
                        } else {
                            connection.release();
                            return callback(null, info);
                        }
                    })
                }
            })
        });
    });
}
