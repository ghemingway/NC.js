"use strict";
var StepNC = require('../../../../../StepNCNode/build/Release/StepNC');

var machineStates = {};
var loopStates = {};

var update = (val) => {
  app.ioServer.emit("nc:state", val);
}

var _getDelta = function(pid, key, cb) {
  var response = "";
  if (key) {
    response = machineStates[ncId].GetKeystateJSON();
  }
  else {
    response = machineStates[ncId].GetDeltaJSON();
  }
  app.logger.debug("got " + response);
  cb(response);
}

var _getNext = function(pid, cb) {
  let rc = -1;
  rc = machineStates[ncId].nextWS();
  if (rc == 0) {
    app.logger.debug("Switched!");
    cb();
  }
}

var _loop = function(pid, key) {
  if (loopStates[pid] === true) {
    app.logger.debug("Loop step " + pid);
    let rc = machineStates[pid].AdvanceState();
    if (rc == 0) {  // OK
      _getDelta(pid, key, function(b) {
        app.ioServer.emit('nc:delta', JSON.parse(b));
        setTimeout(function() { _loop(pid, false) }, 300);
      });
    }
    else if (rc == 1) {   // SWITCH
      app.logger.debug("Switching...");
      _getnext(pid, function() { 
        _looper(pid, true);
      });
    }
  }
}

var _loopInit = function(req, res) {
  res.status(200).send("I'm here!");
  if (req.params.ncId && req.params.loopstate) {
    if (typeof(machineStates[ncId]) === 'undefined') {
      machineStates[ncId] = new StepNC.machineState(ncId);
      loopStates[ncId] = new StepNC.machineState(ncId);
    }
    switch(loopstate) {
      case "state":
        if (loopStates[ncId] === true) {
          res.status(200).send("play");
        }
        else {
          res.status(200).send("pause");
        }
        break;
      case "start":
        if (loopStates[ncId] === true) {
          res.status(200).send("Already running");
          return;
        }
        app.logger.debug("Looping " + ncId);
        loopStates[ncId] = true;
        res.status(200).send("OK");
        _update("play");
        _loop(ncId, false);
        break;
      case "stop":
        if (loopStates[ncId] === false) {
          res.status(200).send("Already stopped");
          return;
        }
        loopStates[ncId] = false;
        _update("pause");
        res.status(200).send("OK");
        break;
    }
  }
}

var _test = function(req, res) {
  console.log("I'm here!");
  res.status(200).send("Hello world");
}

module.exports = function(app, cb) {
  // TODO: If there are issues, the autogenerated responses from request and other callbacks may be sending responses.
  app.router.get('v2/nc/projects/:ncId/loop/:loopstate', _loopInit);
  app.router.get('v2/nc/projects/:ncId/loop/', _test);
  app.router.get('v3', _test);
  if (cb) cb();
}
