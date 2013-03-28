#! /usr/bin/env node

var mtgox = require("mtgox-socket-client"),
    Boxcar = require("node-boxcar"),
    express = require("express");

var provider = new Boxcar.provider(process.env.BOXCAR_KEY, process.env.BOXCAR_SECRET);

var client = mtgox.connect();

client.on("open", function(){
	client.unsubscribe(mtgox.getChannel('trade').key);
	client.unsubscribe(mtgox.getChannel('depth').key);
});

var high = -1,
    low = -1,
    highTime = new Date().getTime(),
    lowTime = new Date().getTime();

var lastNotification = 0;

client.on("ticker", function(message){
	var now = new Date().getTime();
	if(high == -1 || low == -1){
		high = low = message.ticker.last;
	}
	var change = false;
	if(message.ticker.last > high || highTime < now - 1000 * 60 * 5){
		high = message.ticker.last;
		highTime = now;
		change = true;
	}
	if(message.ticker.last < low || lowTime < now - 1000 * 60 * 5){
		low = message.ticker.last;
		lowTime = now;
		change = true;
	}

	if(change){
		var dPrice = high - low;
		var dTime = highTime - lowTime;
		var rate = (dPrice / message.ticker.last) / dTime; // rate is in change/millisecond here!
		var ratePH = rate / 1000 / 60 / 60; // rate in change/hour
		if(Math.abs(ratePH) > .05){
			if(now - lastNotification < 1000 * 60 * 30){ // Don't send more than 2 notifications/hour
				sendNotification(ratePH);
				lastNotification = now;
			}
		}
	}
});

function sendNotification(rate){
	console.log("Sending notification; rate=" + rate);
	provider.broadcast({
		message: "Bitcoins are " + ((rate > 0) ? "surg" : "crash") + "ing! Rate of change is " + Math.round(Math.abs(rate * 100)) + "%/hour!",
		from_screen_name: "Mt.Gox",
		source_url: "https://mtgox.com",
		icon_url: "https://en.bitcoin.it/w/images/en/2/29/BC_Logo_.png"
	}, function(err, info){
		if(err){
			console.error(err);
		}else{
			console.log(info);
		}
	});
}

var app = express();

app.use(express.bodyParser());

app.use(express.static("public"));
app.use(express.directory("public"))

app.post("/", function(req, res, next){
	if(req.body.email){
		provider.subscribe({
			email: req.body.email
		}, function(err, info){
			if(err){
				return next(err);
			}
			res.send(info);
		});
	}else{
		return next("No Email Provided!");
	}
});

app.use(function(err, req, res, next){
	console.error(err);
	next();
});

app.listen(process.env.NODE_PORT);
