'use strict';
var file = require('./file');
var step = require('./step');
var find = file.find;

var app;
var loopTimer;
var loopStates = {};
let playbackSpeed = 100;
let path = find.GetProjectName();
let changed = false;

/****************************** Helper Functions ******************************/

function update(val) {
  app.ioServer.emit('nc:state', val);
}

function updateSpeed(speed) {
  app.ioServer.emit('nc:speed', speed);
}

function getDelta(ms, key, cb) {
  var response = '';
  if (key) {
    response = ms.GetKeystateJSON();
  } else {
    response = ms.GetDeltaJSON();
  }
  cb(response);
}

function getNext(ms, cb) {
  ms.NextWS();
  cb();
}

function getPrev(ms, cb) {
  ms.PrevWS();
  cb();
}

function getToWS(wsId, ms, cb) {
  ms.GoToWS(wsId);
  cb();
}

function loop(ms, key) {
  //let changed = false;
  if (loopStates[path] === true) {
    //app.logger.debug('Loop step ' + path);
    let rc = ms.AdvanceState();
    if (rc === 0) {  // OK
      //app.logger.debug('OK...');
      getDelta(ms, key, function(b) {
        app.ioServer.emit('nc:delta', JSON.parse(b));
        if (playbackSpeed > 0) {
          if (loopTimer !== undefined) {
            clearTimeout(loopTimer);
          }
          if(changed){
            changed = false;
            loopTimer = setTimeout(() => loop(ms, true), 50/(playbackSpeed/200));
          }
          else{
            loopTimer = setTimeout(() => loop(ms, false), 50/(playbackSpeed/200));
          }
        }
      });
    } else if (rc === 1) {   // SWITCH Workingstep
      let setup = sameSetup(ms.GetWSID(), ms.GetNextWSID());
      if (!setup) {
        loopStates[path] = false;
        update('pause');
        changed = true;
      }
      getNext(ms, function() {
        loop(ms, true);
      });
      getDelta(ms, false, function(b) {
        app.ioServer.emit('nc:delta', JSON.parse(b));
        if (playbackSpeed > 0) {
          if (loopTimer !== undefined) {
            clearTimeout(loopTimer);
          }
          loopTimer = setTimeout(() => loop(ms, false), 50/(playbackSpeed/200));
        }
      });
    }
  }
}

function getWorkingstep() {
  var ms = file.ms;
  let keyjson = JSON.parse(ms.GetKeystateJSON());
  return keyjson.workingstep;
}

function sameSetup(newid, oldid) {
  return (step.getSetupFromId(newid) === step.getSetupFromId(oldid)); //Finds the higher level container of the current workingstep
}

function handleWSInit(command, res) {
  let temp = loopStates[path];
  loopStates[path] = true;
  if (!temp) {
    loop(file.ms, false);
  }
  switch (command) {
    case 'next':
      if (temp) {
        getNext(file.ms, function() {
          loop(file.ms, true);
        });
      } else {
        getNext(file.ms, function() {
          loop(file.ms, true);
        });
        loopStates[path] = false;
        update('pause');
      }
      res.sendStatus(200);
      break;
    case 'prev':
      if (temp) {
        getPrev(file.ms, function() {
          loop(file.ms, true);
        });
      } else {
        getPrev(file.ms, function() {
          loop(file.ms, true);
        });
        loopStates[path] = false;
        update('pause');
      }
      res.sendStatus(200);
      break;
    default:
      if (isNaN(parseFloat(command))
        || !isFinite(command)) {
        break;
      }
      let ws = Number(command);
      if (temp) {
        getToWS(ws, file.ms, function() {
          loop(file.ms, true);
        });
      } else {
        getToWS(ws, file.ms, function() {
          loop(file.ms, true);
        });
      }
      loopStates[path] = false;
      update('pause');
      res.sendStatus(200);
  }
}

/***************************** Endpoint Functions *****************************/

function _loopInit(req, res) {
  // app.logger.debug('loopstate is ' + req.params.loopstate);
  if (req.params.loopstate === undefined) {
    if (loopStates[path] === true) {
      res.status(200).send(JSON.stringify({
        'state': 'play',
        'speed': playbackSpeed,
      }));
    } else {
      res.status(200).send(JSON.stringify({
        'state': 'pause',
        'speed': playbackSpeed,
      }));
    }
  } else {
    let loopstate = req.params.loopstate;
    var ms = file.ms;
    if (typeof loopStates[path] === 'undefined') {
      loopStates[path] = false;
    }

    switch (loopstate) {
      case 'start':
        if (loopStates[path] === true) {
          res.status(200).send('Already running');
          return;
        }
        // app.logger.debug('Looping ' + path);
        loopStates[path] = true;
        res.sendStatus(200);
        update('play');
        loop(ms, false);
        break;
      case 'stop':
        if (loopStates[path] === false) {
          res.status(200).send('Already stopped');
          return;
        }
        loopStates[path] = false;
        update('pause');
        res.sendStatus(200);
        break;
      default:
        if (isNaN(parseFloat(loopstate)) || !isFinite(loopstate)) {
          break;
        }
        let newSpeed = Number(loopstate);

        if (Number(playbackSpeed) !== newSpeed) {
          playbackSpeed = newSpeed;
          // app.logger.debug('Changing speed to ' + newSpeed);
        }

        if (loopStates[path] === true) {
          loop(ms, false);
          res.status(200).send(JSON.stringify({
            'state': 'play',
            'speed': playbackSpeed,
          }));
        } else {
          res.status(200).send(JSON.stringify({
            'state': 'pause',
            'speed': playbackSpeed,
          }));
        }
        updateSpeed(playbackSpeed);
    }
  }
}

var _wsInit = function(req, res) {
  if (!req.params.command) {
    return;
  }
  if (typeof loopStates[path] === 'undefined') {
    loopStates[path] = false;
  }

  handleWSInit(req.params.command, res);

  getDelta(file.ms, false, function(b) {
    app.ioServer.emit('nc:delta', JSON.parse(b));
    if (playbackSpeed > 0) {
      if (loopTimer !== undefined) {
        clearTimeout(loopTimer);
      }
      loopTimer = setTimeout(function () {
        loop(file.ms, false);
      }, 50 / (playbackSpeed / 200));
    }
  });
};

function _getKeyState(req, res) {
  var ms = file.ms;
  if (ms === undefined) {
    res.status(404).send('Machine state could not be found');
    return;
  }
  res.status(200).send(ms.GetKeystateJSON());
}

function _getDeltaState(req, res) {
  var ms = file.ms;
  if (ms === undefined) {
    res.status(404).send('Machine state could not be found');
    return;
  }
  res.status(200).send(ms.GetDeltaJSON());
}

module.exports = function(globalApp, cb) {
  app = globalApp;
  app.router.get('/v3/nc/state/key', _getKeyState);
  app.router.get('/v3/nc/state/delta', _getDeltaState);
  app.router.get('/v3/nc/state/loop/:loopstate', _loopInit);
  app.router.get('/v3/nc/state/loop/', _loopInit);
  app.router.get('/v3/nc/state/ws/:command', _wsInit);

  if (cb) {
    cb();
  }
};
