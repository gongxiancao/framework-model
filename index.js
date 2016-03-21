var mongoose = require('mongoose'),
  _ = require('lodash'),
  async = require('async'),
  fs = require('fs'),
  mongodbUri = require('mongodb-uri'),
  pathUtil = require('path'),
  Schema = mongoose.Schema;

function composeMongodbConnectionString (config) {
  return mongodbUri.format(config);
}

function lift (done) {
  var self = this;
  var modelsConfig = self.config.models;
  var connectionName = modelsConfig.connection;
  if(modelsConfig.Promise) {
    mongoose.Promise = modelsConfig.Promise;
  }

  var connectionConfig = self.config.connections[connectionName];
  if(!connectionConfig) {
    throw new Error('No connection config with name ' + connectionName + ' for current env');
  }

  global.ObjectId = Schema.Types.ObjectId;
  global.Mixed = Schema.Types.Mixed;

  var models = self.models = {};
  var modelsPath = self.config.paths.models = pathUtil.join(self.config.paths.root, 'api/models');

  fs.readdir(modelsPath, function (err, fileNames) {
    async.each(fileNames, function (fileName, done) {
      var filePath = pathUtil.join(modelsPath, fileName);
      var extname = pathUtil.extname(filePath);
      if(extname !== '.js') {
        return done();
      }
      fs.stat(filePath, function (err, stat) {
        if(err) {
          return done();
        }

        if(stat.isFile()) {
          var moduleName = pathUtil.basename(fileName, extname);
          models[moduleName] = require(filePath);
        }
        done();
      });
    }, function () {
      _.each(Object.keys(models), function (modelName) {
        var model = models[modelName];
        model.options = model.options || {};
        model.options.collection = model.options.collection || modelName.toLowerCase();
        var schema = new Schema(models[modelName].attributes, model.options);

        if(model.schemaInitializer) {
          model.schemaInitializer(schema);
        }

        models[modelName] = mongoose.model(modelName, schema);
      });

      _.extend(global, models);

      var connectionString = composeMongodbConnectionString(connectionConfig);
      var options = {};
      if(modelsConfig.promise) {
        options.promiseLibrary = modelsConfig.promise;
      }
      mongoose.connect(connectionString, options, done);
    });
  });
}

function lower (done) {
  mongoose.disconnect(done);
}

module.exports = {
  lift: lift,
  lower: lower
};
