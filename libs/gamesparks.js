GameSparks = function() {

	var appSecret;
	
	var socketUrl;
	var lbUrl;
	
	var authToken;
	var sessionId;

	var initialised = false;
	var connected;
	var error;
	var closing;
	
	var initCallback;
	var messageCallback;
	var errorCallback;

	var nonceCallback;
	
	var pendingRequests = {};
	
	var webSocket;
	
	var requestCounter = 0;
	
	this.getSessionId = function(){
		return sessionId;
	}
	
	this.isInitialised = function(){
		return initialised;
	}
	
	this.initPreview = function(options){
		options.url = "wss://preview.gamesparks.net/ws/" + options.key;
		this.init(options);
	}

	this.initLive = function(options){
		options.url = "wss://service.gamesparks.net/ws/" + options.key;
		this.init(options);
	}
	
	this.init = function(options) {
		socketUrl = options.url;
		lbUrl = options.url;
		appSecret = options.secret;
		initCallback = options.onInit;
		messageCallback = options.onMessage;
		errorCallback = options.onError;
		nonceCallback = options.onNonce;

		
		initialised = false;
		connected = false;
		error = false;
		closing = false;
		cleanup();
		connect();
	};
	
	this.send = function(requestType, onResponse){
		this.sendWithData(requestType, {}, onResponse);
	};
	
	this.sendWithData = function(requestType, json, onResponse){
		
		if(!initialised){
			onResponse({error:"NOT_INITIALISED"});
			return;
		}
		if(requestType.indexOf('.') !== 0){
			requestType = "."+requestType;
		}
		json["@class"] = requestType;
		
		json.requestId = (new Date()).getTime() + "_" + (++requestCounter);

		if(onResponse != null){
			pendingRequests[json.requestId] = onResponse;
			setTimeout(function(){
				if(pendingRequests[json.requestId]){
					pendingRequests[json.requestId]({error:"NO_RESPONSE"});
				}
			}, 32000);
		}
		
		var requestString = JSON.stringify(json);
		console.log("WebSocket send: " + requestString);
		webSocket.send(requestString);
	};
	
	function cleanup(){
		if(webSocket != null){
			webSocket.onclose = null;
			webSocket.close();
		}
	}
	
	var keepAliveId;

	function keepAlive(){
		if(initialised && connected){
			webSocket.send(" ");
		}
		keepAliveId = setTimeout(keepAlive, 30000);
	}

	function getWebSocket(location) {
		if (window.WebSocket) {
			return new WebSocket(location);
		} else {
			return new MozWebSocket(location);
		}
	}

	function connect() {
		try{
			webSocket = getWebSocket(socketUrl);
			webSocket.onopen = onWebSocketOpen;
			webSocket.onclose = onWebSocketClose;
			webSocket.onerror = onWebSocketError;
			webSocket.onmessage = onWebSocketMessage;
		}catch(e){}
	}

	function onWebSocketError() {
		socketUrl = lbUrl;
		console.log('WebSocket onError: Sorry, but there is some problem with your socket or the server is down');
		if(errorCallback){
			errorCallback();
		}
		error = true;
	}

	function onWebSocketClose(closeEvent) {
		connected = false;
		console.log('WebSocket onClose executed ');
		if (!error) {
			connect();
		}
	}

	function onWebSocketOpen(openEvent) {
		connected = true;
		console.log('WebSocket onOpen: Connected ' + openEvent);
	}

	function onWebSocketMessage(message) {
		
		var messageData = message.data;
		
		console.log('WebSocket onMessage: ' + messageData);
		
		var result;
		
		try {
			result = JSON.parse(messageData);
		} catch (e) {
			console.log("An error ocurred while parsing the JSON Data: "
					+ message + "; Error: " + e);
			return;
		}

		if (result['authToken']) {
			authToken = result['authToken'];
			delete result['authToken'];
		}

		var resultType = result['@class'];

		if (resultType == ".AuthenticatedConnectResponse") {
			handshake(result);
		} else if (resultType.match(/Response$/)){
			if(result["requestId"]){
				var requestId = result["requestId"];
				delete result["requestId"];
				if(pendingRequests[requestId]){
					pendingRequests[requestId](result);
					pendingRequests[requestId] = null;
				};
			};
		} else {
			messageCallback(result);
		};

	}
	
	function handshake(result){
		
		if (result['connectUrl']) {
			socketUrl = result['connectUrl'];
			return;
		} else if (result['nonce']) {
			
			var hmac;

			if(nonceCallback != null){
				hmac = nonceCallback(result['nonce']);
			} else {
				hmac = CryptoJS.enc.Base64.stringify(CryptoJS.HmacSHA256(result['nonce'], appSecret));
			}

			var toSend = {
				"@class" : ".AuthenticatedConnectRequest",
				hmac : hmac
			};

			if (authToken) {
				toSend.authToken = authToken;
			}

			if (sessionId) {
				toSend.sessionId = sessionId;
			}

			toSend.platform = BrowserDetect.browser;
			toSend.os = BrowserDetect.OS;
			webSocket.send(JSON.stringify(toSend));
			return;
		} else if (result['sessionId']) {
			sessionId = result['sessionId'];
			initialised = true;
			if(initCallback){
				initCallback();
			}
			keepAliveId = setTimeout(keepAlive, 30000);
			return;
		}
	}
};



var BrowserDetect = {
		init: function () {
			this.browser = this.searchString(this.dataBrowser) || "An unknown browser";
			this.version = this.searchVersion(navigator.userAgent)
				|| this.searchVersion(navigator.appVersion)
				|| "an unknown version";
			this.OS = this.searchString(this.dataOS) || "an unknown OS";
		},
		searchString: function (data) {
			for (var i=0;i<data.length;i++)	{
				var dataString = data[i].string;
				var dataProp = data[i].prop;
				this.versionSearchString = data[i].versionSearch || data[i].identity;
				if (dataString) {
					if (dataString.indexOf(data[i].subString) != -1)
						return data[i].identity;
				}
				else if (dataProp)
					return data[i].identity;
			}
		},
		searchVersion: function (dataString) {
			var index = dataString.indexOf(this.versionSearchString);
			if (index == -1) return;
			return parseFloat(dataString.substring(index+this.versionSearchString.length+1));
		},
		dataBrowser: [
			{
				string: navigator.userAgent,
				subString: "Chrome",
				identity: "Chrome"
			},
			{ 	string: navigator.userAgent,
				subString: "OmniWeb",
				versionSearch: "OmniWeb/",
				identity: "OmniWeb"
			},
			{
				string: navigator.vendor,
				subString: "Apple",
				identity: "Safari",
				versionSearch: "Version"
			},
			{
				prop: window.opera,
				identity: "Opera",
				versionSearch: "Version"
			},
			{
				string: navigator.vendor,
				subString: "iCab",
				identity: "iCab"
			},
			{
				string: navigator.vendor,
				subString: "KDE",
				identity: "Konqueror"
			},
			{
				string: navigator.userAgent,
				subString: "Firefox",
				identity: "Firefox"
			},
			{
				string: navigator.vendor,
				subString: "Camino",
				identity: "Camino"
			},
			{		// for newer Netscapes (6+)
				string: navigator.userAgent,
				subString: "Netscape",
				identity: "Netscape"
			},
			{
				string: navigator.userAgent,
				subString: "MSIE",
				identity: "Explorer",
				versionSearch: "MSIE"
			},
			{
				string: navigator.userAgent,
				subString: "Gecko",
				identity: "Mozilla",
				versionSearch: "rv"
			},
			{ 		// for older Netscapes (4-)
				string: navigator.userAgent,
				subString: "Mozilla",
				identity: "Netscape",
				versionSearch: "Mozilla"
			}
		],
		dataOS : [
			{
				string: navigator.platform,
				subString: "Win",
				identity: "Windows"
			},
			{
				string: navigator.platform,
				subString: "Mac",
				identity: "Mac"
			},
			{
				   string: navigator.userAgent,
				   subString: "iPhone",
				   identity: "iPhone/iPod"
		    },
			{
				string: navigator.platform,
				subString: "Linux",
				identity: "Linux"
			}
		]

	};
	BrowserDetect.init();
