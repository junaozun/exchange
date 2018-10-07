
let token = require("../models/token")
let config = require("../config/config")

module.exports = {
    homeListHtml: async(ctx) => {

        let {error, data} = await token.findAllToken()
        for (const key in data) {
            let element = data[key]
            let tokeninfo = config.tokeninfo[element.id]
            if (tokeninfo) {
                element.price = tokeninfo.price
                element.number = tokeninfo.number
            }
        }

        await ctx.render("home.html", {
            list:data

        })
    }
}