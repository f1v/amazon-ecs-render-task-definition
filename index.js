const path = require('path');
const core = require('@actions/core');
const tmp = require('tmp');
const fs = require('fs');

async function run() {
  try {
    // Get inputs
    const taskDefinitionFile = core.getInput('task-definition', {
      required: true,
    });
    const containerName = core.getInput('container-name', { required: true });
    const imageURI = core.getInput('image', { required: true });
    const mountPoints = core.getInput('mount-points', { required: false });
    const volumes = core.getInput('volumes', { required: false });

    // Parse the task definition
    const taskDefPath = path.isAbsolute(taskDefinitionFile)
      ? taskDefinitionFile
      : path.join(process.env.GITHUB_WORKSPACE, taskDefinitionFile);
    if (!fs.existsSync(taskDefPath)) {
      throw new Error(
        `Task definition file does not exist: ${taskDefinitionFile}`
      );
    }
    const taskDefContents = require(taskDefPath);

    // Insert the image URI
    if (!Array.isArray(taskDefContents.containerDefinitions)) {
      throw new Error(
        'Invalid task definition format: containerDefinitions section is not present or is not an array'
      );
    }
    const containerDef = taskDefContents.containerDefinitions.find(function (
      element
    ) {
      return element.name == containerName;
    });
    if (!containerDef) {
      throw new Error(
        'Invalid task definition: Could not find container definition with matching name'
      );
    }

    if (volumes) {
      const volumeList = JSON.parse(volumes);
      if (!Array.isArray(volumeList)) {
        throw new Error(
          'Invalid mount point: Volumes should be specified as an array of objects'
        );
      }

      volumeList.forEach(function (volume) {
        taskDefContents.volumes.push({
          efsVolumeConfiguration: null,
          name: volume.name,
          host: {
            sourcePath: volume.path,
          },
          dockerVolumeConfiguration: null,
        });
      });
      // [{"source-volume-name":"/host/source/path"}]/
    }

    if (mountPoints) {
      const mounts = JSON.parse(mountPoints);
      if (!Array.isArray(mounts)) {
        throw new Error(
          'Invalid mount point: Mounts should be specified as an array of objects'
        );
      }

      mounts.forEach(function (mountEntry) {
        const container = taskDefContents.containerDefinitions.find(function (
          element
        ) {
          return element.name == mountEntry.container;
        });
        container.mountPoints.push({
          readOnly: null,
          containerPath: mountEntry.path,
          sourceVolume: mountEntry.source,
        });

        const volume = taskDefContents.volumes.find(function (element) {
          return element.name == mountEntry.source;
        });
        if (!volume) {
          throw new Error(
            `Invalid task definition: Could not find volume with name ${mountEntry.source}`
          );
        }
      });
    }
    containerDef.image = imageURI;

    // Write out a new task definition file
    var updatedTaskDefFile = tmp.fileSync({
      tmpdir: process.env.RUNNER_TEMP,
      prefix: 'task-definition-',
      postfix: '.json',
      keep: true,
      discardDescriptor: true,
    });
    const newTaskDefContents = JSON.stringify(taskDefContents, null, 2);
    fs.writeFileSync(updatedTaskDefFile.name, newTaskDefContents);
    core.setOutput('task-definition', updatedTaskDefFile.name);
  } catch (error) {
    core.setFailed(error.message);
  }
}

module.exports = run;

/* istanbul ignore next */
if (require.main === module) {
  run();
}
