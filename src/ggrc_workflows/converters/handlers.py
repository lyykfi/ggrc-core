# Copyright (C) 2017 Google Inc.
# Licensed under http://www.apache.org/licenses/LICENSE-2.0 <see LICENSE file>


""" Module for all special column handlers for workflow objects """

from sqlalchemy import inspection

from ggrc import db
from ggrc import models
from ggrc.converters import errors
from ggrc.converters.handlers import boolean
from ggrc.converters.handlers import handlers
from ggrc.converters.handlers import multi_object
from ggrc_basic_permissions import models as bp_models
from ggrc_workflows import models as wf_models


class WorkflowColumnHandler(handlers.ParentColumnHandler):

  """ handler for workflow column in task groups """

  def __init__(self, row_converter, key, **options):
    """ init workflow handler """
    self.parent = wf_models.Workflow
    super(WorkflowColumnHandler, self).__init__(row_converter, key, **options)


class TaskGroupColumnHandler(handlers.ParentColumnHandler):

  """ handler for task group column in task group tasks """

  def __init__(self, row_converter, key, **options):
    """ init task group handler """
    self.parent = wf_models.TaskGroup
    super(TaskGroupColumnHandler, self).__init__(row_converter, key, **options)


class CycleTaskGroupColumnHandler(handlers.ParentColumnHandler):

  """ handler for task group column in task group tasks """

  def __init__(self, row_converter, key, **options):
    """ init task group handler """
    self.parent = wf_models.CycleTaskGroup
    super(CycleTaskGroupColumnHandler, self) \
        .__init__(row_converter, key, **options)


class UnitColumnHandler(handlers.ColumnHandler):

  """Handler for workflow 'repeat every' units column."""

  def parse_item(self):
    """Parse Unit column value."""
    value = self.raw_value.lower().strip()
    if value in {"-", "--", "---"}:
      self.set_empty = True
      value = None
    elif not value:
      value = None

    if not self.row_converter.is_new and self.raw_value:
      insp = inspection.inspect(self.row_converter.obj)
      unit_prev = getattr(insp.attrs, self.key).history.unchanged
      if not value in unit_prev:
        self.add_warning(errors.UNMODIFIABLE_COLUMN,
                         column_name=self.display_name)
        self.set_empty = False
      return None

    if value and value not in wf_models.Workflow.VALID_UNITS:
      self.add_error(errors.WRONG_VALUE_ERROR,
                     column_name=self.display_name)
      return None

    return value


class RepeatEveryColumnHandler(handlers.ColumnHandler):

  """Handler for workflow 'repeat every' column."""

  def parse_item(self):
    """Parse 'repeat every' value
    """
    value = self.raw_value.strip()
    if value in {"-", "--", "---"}:
      self.set_empty = True
      value = None
    elif value:
      try:
        value = int(self.raw_value)
        if not (0 < value < 31):
          raise ValueError
      except ValueError:
        self.add_error(errors.WRONG_VALUE_ERROR,
                       column_name=self.display_name)
        return
    else:
      # if it is an empty string
      value = None

    # check if value is unmodified for existing workflow
    if not self.row_converter.is_new and self.raw_value:
      insp = inspection.inspect(self.row_converter.obj)
      repeat_prev = getattr(insp.attrs, self.key).history.unchanged
      if not value in repeat_prev:
        self.add_warning(errors.UNMODIFIABLE_COLUMN,
                         column_name=self.display_name)
        self.set_empty = False
      return None

    return value

  def get_value(self):
    """Get 'Repeat Every' user readable value for Workflow."""
    value = super(RepeatEveryColumnHandler, self).get_value()
    if value:
      return str(value)
    return ""


class TaskTypeColumnHandler(handlers.ColumnHandler):

  """Handler for task type column in task group tasks."""

  type_map = {
      "rich text": "text",
      "dropdown": "menu",
      "drop down": "menu",
      "checkboxes": "checkbox",
      "checkbox": "checkbox",
  }

  reverse_map = {
      "text": "rich text",
      "menu": "dropdown",
      "checkbox": "checkbox"
  }

  def parse_item(self):
    """Parse task type column value."""
    value = self.type_map.get(self.raw_value.lower())
    if value is None:
      if self.raw_value.lower() in self.type_map.values():
        value = self.raw_value.lower()
    if value is None:
      value = self.row_converter.obj.default_task_type()
      default_value = self.reverse_map.get(value).title()
      if self.raw_value:
        self.add_warning(errors.WRONG_REQUIRED_VALUE,
                         value=self.raw_value,
                         column_name=self.display_name)
      else:
        self.add_warning(errors.MISSING_VALUE_WARNING,
                         default_value=default_value,
                         column_name=self.display_name)
    return value

  def get_value(self):
    """Get titled user readable value for taks type."""
    return self.reverse_map.get(self.row_converter.obj.task_type,
                                "rich text").title()


class WorkflowPersonColumnHandler(handlers.UserColumnHandler):

  def parse_item(self):
    return self.get_users_list()

  def set_obj_attr(self):
    pass

  def get_value(self):
    workflow_person = db.session.query(wf_models.WorkflowPerson.person_id)\
        .filter_by(workflow_id=self.row_converter.obj.id,)
    workflow_roles = db.session.query(bp_models.UserRole.person_id)\
        .filter_by(context_id=self.row_converter.obj.context_id)
    users = models.Person.query.filter(
        models.Person.id.in_(workflow_person) &
        models.Person.id.notin_(workflow_roles)
    )
    emails = [user.email for user in users]
    return "\n".join(emails)

  def remove_current_people(self):
    wf_models.WorkflowPerson.query.filter_by(
        workflow_id=self.row_converter.obj.id).delete()

  def insert_object(self):
    if self.dry_run or not self.value:
      return
    self.remove_current_people()
    for owner in self.value:
      workflow_person = wf_models.WorkflowPerson(
          workflow=self.row_converter.obj,
          person=owner,
          context=self.row_converter.obj.context
      )
      db.session.add(workflow_person)
    self.dry_run = True


class ObjectsColumnHandler(multi_object.ObjectsColumnHandler):

  def get_value(self):
    task_group_objects = wf_models.TaskGroupObject.query.filter_by(
        task_group_id=self.row_converter.obj.id).all()
    lines = ["{}: {}".format(t.object._inflector.title_singular.title(),
                             t.object.slug)
             for t in task_group_objects if t.object is not None]
    return "\n".join(lines)

  def insert_object(self):
    obj = self.row_converter.obj
    existing = set((t.object_type, t.object_id)
                   for t in obj.task_group_objects)
    for object_ in self.value:
      if (object_.type, object_.id) in existing:
        continue
      tgo = wf_models.TaskGroupObject(
          task_group=obj,
          object=object_,
          context=obj.context,
      )
      db.session.add(tgo)
    db.session.flush()


class CycleWorkflowColumnHandler(handlers.ExportOnlyColumnHandler):

  def get_value(self):
    return self.row_converter.obj.workflow.slug


class CycleColumnHandler(handlers.ExportOnlyColumnHandler):

  def get_value(self):
    return self.row_converter.obj.cycle.slug


class TaskDescriptionColumnHandler(handlers.TextareaColumnHandler):

  def set_obj_attr(self):
    """ Set task attribute based on task type """
    if not self.value or self.row_converter.ignore:
      return
    if self.row_converter.obj.task_type == "text":
      self.row_converter.obj.description = self.value
    else:
      options = [v.strip() for v in self.value.split(",")]
      self.row_converter.obj.response_options = options

  def get_value(self):
    if self.row_converter.obj.task_type == "text":
      return self.row_converter.obj.description
    else:
      return ", ".join(self.row_converter.obj.response_options)


COLUMN_HANDLERS = {
    "default": {
        "cycle": CycleColumnHandler,
        "cycle_task_group": CycleTaskGroupColumnHandler,
        "cycle_workflow": CycleWorkflowColumnHandler,
        "unit": UnitColumnHandler,
        "repeat_every": RepeatEveryColumnHandler,
        "notify_on_change": boolean.CheckboxColumnHandler,
        "task_description": TaskDescriptionColumnHandler,
        "task_group": TaskGroupColumnHandler,
        "task_group_objects": ObjectsColumnHandler,
        "task_type": TaskTypeColumnHandler,
        "workflow": WorkflowColumnHandler,
        "finished_date": handlers.DateColumnHandler,
        "verified_date": handlers.DateColumnHandler,
    },
}
