
let token = require("../models/token")
let config = require("../config/config")
let usertoken = require("../models/usertoken")
let { success, fail } = require("../utils/myUtils")
let transaction = require("../models/transaction")
let order = require("../models/order")
let income = require("../models/income")
let sqlHelpper = require("../utils/sqlHelpper")
let myUtils = require("../utils/myUtils")

function handleSelectObjects(tokenData, param) {
    if (tokenData && tokenData.data && tokenData.data.length > 0) {
        return tokenData.data[0][param]
    }
    return null
}

module.exports = {
    //获取挂单页面
    transactionHtml: async (ctx) => {
        console.log(config.tokenPassword)
        config.tokenPassword = "213qwew"

        let { userid, tokenid, replacetokentype } = ctx.request.query
        console.log(JSON.stringify(ctx.request.query))

        //查询交易的token的数据
        let tokenData = await token.findTokenWithId(tokenid)
        //查询被交易的token的数据
        let replacetokenid = config.tokenType[replacetokentype]
        let replaceTokenData = await token.findTokenWithId(replacetokenid)

        //查询交易的token的余额
        let usertokenData = await usertoken.findUserToken(userid, tokenid)

        //查询被交易的token的余额
        let usertokenData2 = await usertoken.findUserToken(userid, replacetokenid)

        await ctx.render("transaction.html", {
            name: handleSelectObjects(tokenData, "name"),
            symbol: handleSelectObjects(tokenData, "symbol"),
            replacename: handleSelectObjects(replaceTokenData, "name"),
            replacesymbol: handleSelectObjects(replaceTokenData, "symbol"),
            availBalance: handleSelectObjects(usertokenData, "balance") - handleSelectObjects(usertokenData, "lockbalance"),
            replaceAvailBalacne: handleSelectObjects(usertokenData2, "balance") - handleSelectObjects(usertokenData2, "lockbalance"),
            replacetokentype: replacetokentype,
            tokenid: tokenid,
        })
    },

    //挂单页面的列表数据
    transactionList: async(ctx) => {
        let { userid, tokenid, replacetokentype } = ctx.request.query
        console.log(JSON.stringify(ctx.request.query))
        let replacetokenid = config.tokenType[replacetokentype]
        let sell = await transaction.findTransaction(2, tokenid, replacetokenid)
        let buy = await transaction.findTransaction(1, tokenid, replacetokenid)
        let delegate = await transaction.findDelegateTransaction(userid, 0, tokenid, replacetokenid)
        let myOrder = await order.findOrderWithUserid(userid, tokenid, replacetokenid)

        let newPrice = 0
        if (config.tokeninfo[tokenid] && config.tokeninfo[tokenid].price) {
            newPrice = config.tokeninfo[tokenid].price
        }

        ctx.body = success({
            sell:sell.data,
            buy:buy.data,
            delegate:delegate.data,
            order: myOrder.data,
            price:newPrice
        })
    },

    //添加挂单
    addOrder: async (ctx) => {
        let body = ctx.request.body
        let { userid, price, count, tokenid, replacetokentype, type } = body
        console.log(JSON.stringify(body))
        let replacetokenid = config.tokenType[replacetokentype]

        //如果是用USDT买EOS，tokenid是EOS的id，replacetokenid是USDT的id
        //１．计算交易的金额（数量）,和交易的tokenid
        let checkId
        let transactionBalance
        if (type == "1") {
            //买，需要查USDT
            checkId = replacetokenid
            transactionBalance = price * count
        } else {
            //卖,需要查EOS
            checkId = tokenid
            transactionBalance = count
        }
        let usertokenData = await usertoken.findUserToken(userid, checkId)
        let balance = handleSelectObjects(usertokenData, "balance")
        if (balance == null) {
            ctx.body = fail("余额不足")
            return
        }
        let lockbalance = handleSelectObjects(usertokenData, "lockbalance")
        let availBalacne = balance - lockbalance
        //2.判断可用余额是否足够去挂单(可用余额与交易金额进行比较)
        if (availBalacne < transactionBalance) {
            ctx.body = fail("余额不足")
            return
        }
        //３．锁定余额
        await usertoken.addLockBalance(userid, checkId, transactionBalance)
        //4. 添加到挂单表
        let transactionModel = {
            userid: userid,
            tokenid: tokenid,
            replacetokenid: replacetokenid,
            count: count,
            price: price,
            status: 0,
            type: type,
            totalcount: count,
        }
        let { data } = await transaction.createTransaction(transactionModel)

        ctx.body = success("ok")

        //5.匹配交易
        let params = body
        params.id = data.insertId
        params.replacetokenid = replacetokenid
        //用新添加的挂单去匹配之前的的所有挂单
        await matchTransaction(params)
    }

}

//匹配挂单的交易
async function matchTransaction(transactionData) {
    let { error, data } = await transaction.matchTransaction(transactionData)

    if (error || data == null || data.length == 0) {
        console.log("未能匹配对应的挂单")
        return
    }

    //设置token最新价
    if (config.tokeninfo[transactionData.tokenid]) {
        config.tokeninfo[transactionData.tokenid].price = transactionData.price
    } else {
        config.tokeninfo[transactionData.tokenid] = {
            price: transactionData.price,
            number : 0
        }
    }

    let index = 0
    //surplusCount记录新增的挂单还有多少量可以交易
    let surplusCount = transactionData.count
    while (surplusCount > 0 && index < data.length) {
        let rowData = data[index]
        let transactionCount

        if (rowData.count > surplusCount) {
            transactionCount = surplusCount
            surplusCount = 0
        } else {
            transactionCount = rowData.count
            surplusCount -= rowData.count
        }

        //处理被交易方的数据
        await handleTransaction(rowData, transactionCount)
        //新增交易所收入数据
        //transactionCount*(rowData.price-transactionData.price)
        let incomeBalacne = transactionCount * Math.abs(rowData.price-transactionData.price)
        await income.createIncome(rowData.id, incomeBalacne)

        index++
    }

    //处理交易方的数据
    await handleTransaction(transactionData, transactionData.count - surplusCount)
    //设置token交易量
    let lastNumber = 0
    if (config.tokeninfo[transactionData.tokenid] && config.tokeninfo[transactionData.tokenid].number) {
        lastNumber = config.tokeninfo[transactionData.tokenid].number
    }
    config.tokeninfo[transactionData.tokenid].number = lastNumber + (transactionData.count - surplusCount)

}

//使用的事务执行sql
//匹配出来了一个叫交易进行处理
async function handleTransaction(rowData, transactionCount) {
    let {id, userid, tokenid, replacetokenid, type, count, price} = rowData
    let sqlParams = []

    //1. 更新挂单列表数据
    sqlParams.push({
        sql:`update transaction set count=count-?,status=${count==transactionCount? "1":"0"},updatetime=?
    where id=?`, 
        params:[transactionCount, myUtils.timestamp(), id]
    })

    //2. 新增订单
    sqlParams.push({
        sql:"insert into orders values(0,?,?,?,?)",
        params:[userid, id, transactionCount, myUtils.timestamp()]
    })

    //3. 增加买的token数量
    //usdt : rowData.price*transactionCount
    let addTokenid
    let addTokenCount
    if (type == 1) {
        addTokenid = tokenid
        addTokenCount = transactionCount
    } else {
        addTokenid = replacetokenid
        addTokenCount = transactionCount*price
    }
    //查询要增加的token是否在usertoken表里已经存在
    let usertokenData = await usertoken.findUserToken(userid, addTokenid)
    if (usertokenData.error || usertokenData.data == null || usertokenData.length == 0) {
        //新增token的数量到usertoken表
        sqlParams.push({
            sql:"insert into usertoken values(0,?,?,?,0,0)",
            params:[userid, addTokenid, addTokenCount]
        })
    } else {
        //增加usertoken表里的balance 
        sqlParams.push({
            sql:`update usertoken set balance=balance+? where userid=? and tokenid=?`,
            params:[addTokenCount, userid, addTokenid]
        })
    }

    //4. 减少卖的token数量
    //减少的token肯定在usertoken表里存在，所以直接减少相应的token余额
    let subTokenid
    let subTokenCount
    if (type == 1) {
        subTokenid = replacetokenid
        subTokenCount = transactionCount*price
    } else {
        subTokenid = tokenid
        subTokenCount = transactionCount
    }
    sqlParams.push({
        sql:"update usertoken set balance=balance-?,lockbalance=lockbalance-? where userid=? and tokenid=?",
        params:[subTokenCount, subTokenCount, userid, subTokenid]
    })

    await sqlHelpper.executionTransactions(sqlParams)
}

//未用事务操作
//匹配出来了一个叫交易进行处理
async function handleTransaction2(rowData, transactionCount) {
    let {id, userid, tokenid, replacetokenid, type, count, price} = rowData

    //1. 更新挂单列表数据
    await transaction.modifyTransaction(id, transactionCount, count)

    //2. 新增订单
    await order.createOrder(userid, id, transactionCount)

    //3. 增加买的token数量
    //usdt : rowData.price*transactionCount
    let addTokenid
    let addTokenCount
    if (type == 1) {
        addTokenid = tokenid
        addTokenCount = transactionCount
    } else {
        addTokenid = replacetokenid
        addTokenCount = transactionCount*price
    }
    //查询要增加的token是否在usertoken表里已经存在
    let usertokenData = await usertoken.findUserToken(userid, addTokenid)
    if (usertokenData.error || usertokenData.data == null || usertokenData.length == 0) {
        //新增token的数量到usertoken表
        await usertoken.createUsertoken(userid, addTokenid, addTokenCount, 0)
    } else {
        //增加usertoken表里的balance 
        await usertoken.addBalanceToUsertoken(userid, addTokenid, addTokenCount, 0)
    }

    //4. 减少卖的token数量
    //减少的token肯定在usertoken表里存在，所以直接减少相应的token余额
    let subTokenid
    let subTokenCount
    if (type == 1) {
        subTokenid = replacetokenid
        subTokenCount = transactionCount*price
    } else {
        subTokenid = tokenid
        subTokenCount = transactionCount
    }
    await usertoken.subBalanceAndLockBalance(userid, subTokenid, subTokenCount)

    
}