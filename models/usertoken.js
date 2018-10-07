

let sqlHelpper = require("../utils/sqlHelpper")

module.exports = {
    findUsertokenWithId: async(userid, tokenid) => {
        //usertoken和token内连接查询
        let sql = `select tokenid,usertoken.balance,usertoken.lockbalance,token.symbol 
        from usertoken inner join token on 
        userid=? and tokenid=? and tokenid=token.id`
        let data = await sqlHelpper.query(sql, [userid, tokenid])
        return data
    },

    subBalance: async(userid, tokenid, num) => {
        let sql = "update usertoken set balance=balance-? where userid=? and tokenid=?"
        let data = await sqlHelpper.query(sql, [num, userid, tokenid])
        return data
    },

    subBalanceAndLockBalance: async(userid, tokenid, num) => {
        let sql = "update usertoken set balance=balance-?,lockbalance=lockbalance-? where userid=? and tokenid=?"
        let data = await sqlHelpper.query(sql, [num, num, userid, tokenid])
        return data
    },

    findUserToken: async(userid, tokenid) => {
        let sql = "select *from usertoken where userid=? and tokenid=?"
        let data = await sqlHelpper.query(sql, [userid, tokenid])
        return data
    },

    createUsertoken: async(userid, tokenid, number, number2) => {
        let sql = "insert into usertoken values(0,?,?,?,0,?)"
        let data = await sqlHelpper.query(sql, [userid, tokenid, number, number2])
        return data
    },

    addBalanceToUsertoken: async(userid, tokenid, number, tokenbalance) => {
        let sql = `update usertoken set balance=balance+?, tokenbalance=tokenbalance+?
         where userid=? and tokenid=?`
         let data = await sqlHelpper.query(sql, [number, tokenbalance, userid, tokenid])
         return data
    },

    addLockBalance: async(userid, tokenid, number) => {
        let sql = "update usertoken set lockbalance=lockbalance+? where userid=? and tokenid=?"
        return await sqlHelpper.query(sql, [number, userid, tokenid])
    }
}