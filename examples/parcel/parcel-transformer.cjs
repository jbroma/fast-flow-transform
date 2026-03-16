const { createFastFlowTransformParcel } = require('fast-flow-transform/parcel');

module.exports = createFastFlowTransformParcel({
  dialect: 'flow-detect',
  format: 'compact',
  reactRuntimeTarget: '18',
  sourcemap: true,
});
