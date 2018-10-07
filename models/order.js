
let sqlHelpper = require("../utils/sqlHelpper")
let myUtile = require("../utils/myUtils")

module.exports = {
    findOrderWithUserid: async(userid, tokenid, replacetokenid) => {
        let sql =　`select orders.id,orders.createtime,orders.count,transaction.type,transaction.price
        from orders inner join transaction on orders.transactionid=transaction.id 
        and orders.userid=? and tokenid=? and replacetokenid=?`
        return await sqlHelpper.query(sql, [userid, tokenid, replacetokenid])
    },

    createOrder: async(userid, transactionid, count) => {
        let sql = "insert into orders values(0,?,?,?,?)"
        let params = [userid, transactionid, count, myUtile.timestamp()]
        return await sqlHelpper.query(sql, params)
    }
}