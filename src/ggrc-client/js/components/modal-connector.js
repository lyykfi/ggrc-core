/*
 Copyright (C) 2018 Google Inc.
 Licensed under http://www.apache.org/licenses/LICENSE-2.0 <see LICENSE file>
 */

import {
  isSnapshotType,
} from '../plugins/utils/snapshot-utils';
import Mappings from '../models/mappers/mappings';
import * as MapperUtils from '../plugins/utils/mapper-utils';
import {
  REFRESH_MAPPING,
  REFRESH_SUB_TREE,
  DEFERRED_MAP_OBJECTS,
} from '../events/eventTypes';
import {getPageInstance} from '../plugins/utils/current-page-utils';

/*
 Below this line we're defining a can.Component, which is in this file
 because it works in tandem with the modals form controller.

 The purpose of this component is to allow for pending adds/removes of connected
 objects while the modal is visible.  On save, the actual pending actions will
 be resolved and we won't worry about the transient state we use anymore.
 */
export default can.Component.extend({
  tag: 'ggrc-modal-connector',
  // <content> in a component template will be replaced with whatever is contained
  //  within the component tag.  Since the views for the original uses of these components
  //  were already created with content, we just used <content> instead of making
  //  new view template files.
  template: '<isolate-form><content/></isolate-form>',
  viewModel: {
    useSnapshots: false,
    instance: null,
    list: [],
    preMappedObjects: [],
    mappedObjects: [],
    // the following are just for the case when we have no object to start with,
    changes: [],
    performMapActions(instance, objects) {
      let pendingMap = Promise.resolve();

      if (objects.length > 0) {
        pendingMap = MapperUtils.mapObjects(instance, objects, {
          useSnapshots: this.attr('useSnapshots'),
        });
      }

      return pendingMap;
    },
    performUnmapActions(instance, objects) {
      let pendingUnmap = Promise.resolve();

      if (objects.length > 0) {
        pendingUnmap = MapperUtils.unmapObjects(instance, objects);
      }

      return pendingUnmap;
    },
    preparePendingJoins() {
      can.each(this.attr('changes'), (item) => {
        let mapping = this.mapping ||
            Mappings.get_canonical_mapping_name(
              this.instance.constructor.shortName,
              item.what.constructor.shortName);
        if (item.how === 'add') {
          this.instance
            .mark_for_addition(mapping, item.what, item.extra);
        } else {
          this.instance.mark_for_deletion(mapping, item.what);
        }
      });
    },
    afterDeferredUpdate(objects) {
      const instance = this.attr('instance');
      const objectTypes = _.uniq(objects
        .map((object) => object.constructor.shortName)
      );

      objectTypes.forEach((objectType) => {
        instance.dispatch({
          ...REFRESH_MAPPING,
          destinationType: objectType,
        });
      });
      instance.dispatch(REFRESH_SUB_TREE);

      const pageInstance = getPageInstance();

      if (objects.includes(pageInstance)) {
        pageInstance.dispatch({
          ...REFRESH_MAPPING,
          destinationType: instance.type,
        });
      }
    },
    handlePendingOperations(pendingJoins) {
      const instance = this.attr('instance');
      const getObject = (pj) => pj.what;
      const objectsForMap = pendingJoins.filter((pj) => pj.how === 'add')
        .map(getObject);
      const objectsForUnmap = pendingJoins.filter((pj) => pj.how === 'remove')
        .map(getObject);

      return Promise.all([
        this.performMapActions(instance, objectsForMap),
        this.performUnmapActions(instance, objectsForUnmap),
      ]);
    },
    async deferredUpdate() {
      const instance = this.attr('instance');

      this.preparePendingJoins();

      // We need to remove all _pending_joins from the instance (via splice())
      // in order to resolveDeferredBindings util after instance.save
      // via modal functionality doesn't handle it second time.
      const pendingJoins = instance._pending_joins.splice(0);
      await this.handlePendingOperations(pendingJoins);
      const objects = pendingJoins.map((pj) => pj.what);
      this.afterDeferredUpdate(objects);
    },
    addMappings(objects) {
      can.each(objects, (obj) => {
        const changes = this.attr('changes');
        const indexOfRemoveChange = this.findObjectInChanges(obj, 'remove');

        if (indexOfRemoveChange !== -1) {
          // remove "remove" change
          changes.splice(indexOfRemoveChange, 1);
        } else {
          // add "add" change
          changes.push({what: obj, how: 'add'});
        }

        this.addListItem(obj);
      });
    },
    removeMappings(obj) {
      let len = this.attr('list').length;
      const changes = this.attr('changes');
      const indexOfAddChange = this.findObjectInChanges(obj, 'add');

      if (indexOfAddChange !== -1) {
        // remove "add" change
        changes.splice(indexOfAddChange, 1);
      } else {
        // add "remove" change
        changes.push({what: obj, how: 'remove'});
      }

      for (; len >= 0; len--) {
        if (this.attr('list')[len] === obj) {
          this.attr('list').splice(len, 1);
        }
      }
    },
    addListItem(item) {
      let snapshotObject;

      if (isSnapshotType(item) &&
        item.snapshotObject) {
        snapshotObject = item.snapshotObject;
        item.attr('title', snapshotObject.title);
        item.attr('description', snapshotObject.description);
        item.attr('class', snapshotObject.class);
        item.attr('snapshot_object_class', 'snapshot-object');
        item.attr('viewLink', snapshotObject.originalLink);
      } else if (!isSnapshotType(item) && item.reify) {
        // add full item object from cache
        // if it isn't snapshot
        item = item.reify();
      }

      this.attr('list').push(item);
    },
    updateObjectList() {
      const updatedList = this.attr('preMappedObjects')
        .concat(this.attr('mappedObjects'));
      this.attr('list').replace(updatedList);
    },
    findObjectInChanges(object, changeType) {
      return _.findIndex(this.attr('changes'), (change) => {
        const {what} = change;
        return (
          what.id === object.id &&
          what.type === object.type &&
          change.how === changeType
        );
      });
    },
  },
  events: {
    init() {
      const viewModel = this.viewModel;
      viewModel.addMappings(viewModel.attr('preMappedObjects'));
    },
    '{viewModel} mappedObjects'() {
      this.viewModel.updateObjectList();
    },
    '{instance} updated'() {
      this.viewModel.deferredUpdate();
    },
    '{instance} created'() {
      this.viewModel.deferredUpdate();
    },
    'a[data-object-source] modal:success'(el, ev, object) {
      ev.stopPropagation();
      this.viewModel.addMappings([object]);
    },
    [`{instance} ${DEFERRED_MAP_OBJECTS.type}`](el, {objects}) {
      this.viewModel.addMappings(objects);
    },
  },
});
