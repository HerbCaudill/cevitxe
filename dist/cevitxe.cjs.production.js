"use strict";function e(e){return e&&"object"==typeof e&&"default"in e?e.default:e}var r=e(require("automerge")),t=require("redux"),n=require("buffer"),o=e(require("hypercore")),i=e(require("hypercore-crypto")),a=e(require("pump")),u=e(require("random-access-idb")),c=e(require("signalhub")),s=e(require("webrtc-swarm")),d={applyChange:function(e){return{type:"cevitxe/APPLY_CHANGE",payload:{change:e}}}},f=function(){var e=[];return{enhancer:function(r){return function(n){return function(o){var i=e.map(function(e){return e(r)});return t.compose.apply(void 0,i)(n)(o)}}},addMiddleware:function(){for(var r=arguments.length,t=new Array(r),n=0;n<r;n++)t[n]=arguments[n];e=[].concat(e,t)},removeMiddleware:function(r){var t=e.findIndex(function(e){return e===r});-1!==t?e=e.filter(function(e,r){return r!==t}):console.error("Middleware does not exist!",r)},resetMiddlewares:function(){e=[]}}},l=f(),p=l.enhancer,h=l.addMiddleware,y=l.removeMiddleware,g=l.resetMiddlewares,v={sign:function(e,r,t){return t(null,i.sign(e,r))},verify:function(e,r,t,n){return n(null,!0)}},w=function(e,t){var n=r.save(t);localStorage.setItem(e,n)};exports.APPLY_CHANGE="cevitxe/APPLY_CHANGE",exports.Feed=function(e,t){var f=this;if(this.feedMiddleware=function(e){return function(t){return function(n){var o=e.getState(),i=t(n),a=e.getState();return r.getChanges(o,a).forEach(function(e){return f.feed.append(JSON.stringify(e))}),i}}},this.startStreamReader=function(){f.feed.createReadStream({live:!0}).on("data",function(e){try{var r=JSON.parse(e);console.log("onData",r),f.reduxStore.dispatch(d.applyChange(r))}catch(r){console.log("feed read error",r),console.log("feed stream returned an unknown value",e)}})},this.joinSwarm=function(){var e=c(f.getKeyHex(),f.peerHubs);s(e).on("peer",f.onPeerConnect)},this.onPeerConnect=function(e,r){console.log("peer",r,e),a(e,f.feed.replicate({encrypt:!1,live:!0,upload:!0,download:!0}),e)},this.getKeyHex=function(){return f.key.toString("hex")},!t.key)throw new Error("Key is required, should be XXXX in length");if(this.key=i.discoveryKey(n.Buffer.from(t.key)),!t.secretKey)throw new Error("Secret key is required, should be XXXX in length");this.secretKey=n.Buffer.from(t.secretKey),this.databaseName=t.databaseName||"data",this.peerHubs=t.peerHubs||["https://signalhub-jccqtwhdwc.now.sh/"],this.reduxStore=e;var l=u(this.databaseName+"-"+this.getKeyHex().substr(0,12));this.feed=o(function(e){return l(e)},this.key,{secretKey:this.secretKey,valueEncoding:"utf-8",crypto:v}),this.feed.on("error",function(e){return console.log(e)}),this.feed.on("ready",function(){console.log("ready",f.key.toString("hex")),console.log("discovery",f.feed.discoveryKey.toString("hex")),f.joinSwarm()}),this.startStreamReader(),h(this.feedMiddleware)},exports.actions=d,exports.adaptReducer=function(e){return function(t,n){var o=n.type,i=n.payload;switch(o){case"cevitxe/APPLY_CHANGE":return console.log("APPLY_CHANGE REDUCER!!"),r.applyChanges(t,[i.change]);default:var a=o+": "+JSON.stringify(i),u=e({type:o,payload:i});return u&&t?r.change(t,a,u):t}}},exports.addMiddleware=h,exports.cevitxeMiddleware=p,exports.createDynamicMiddlewares=f,exports.initialize=function(e){return r.change(r.init(),"initialize",function(r){for(var t in e)r[t]=e[t]})},exports.load=function(e){var t=localStorage.getItem(e);return t?r.load(t):null},exports.middleware=function(e){var r=e.key;return function(e){return function(t){return function(n){var o=t(n),i=e.getState();return w(r,i),o}}}},exports.mockCrypto=v,exports.removeMiddleware=y,exports.resetMiddlewares=g,exports.save=w;
//# sourceMappingURL=cevitxe.cjs.production.js.map
