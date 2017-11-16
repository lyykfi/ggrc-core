/* !
  Copyright (C) 2017 Google Inc.
  Licensed under http://www.apache.org/licenses/LICENSE-2.0 <see LICENSE file>
*/

import Component from '../assessment_templates';

describe('assessmentTemplates', ()=> {
  let viewModel;

  beforeAll(()=> {
    viewModel = new (can.Map.extend(Component.prototype.viewModel));
  });

  describe('_selectInitialTemplate() method', function () {
    let templates;

    beforeEach(()=> {
      templates = [
        {
          title: 'No Template',
          value: '',
        },
        {
          group: 'FooBarBaz objects',
          subitems: [
            {title: 'object Foo', value: 'foo'},
            {title: 'object Bar', value: 'bar'},
            {title: 'object Baz', value: 'baz'},
          ],
        },
        {
          group: 'Animal objects',
          subitems: [
            {title: 'Elephant Dumbo', value: 'elephant'},
            {title: 'Flying Pig', value: 'pig'},
            {title: 'Tiny Mouse', value: 'mouse'},
          ],
        },
      ];
    });

    it('selects the first item from the first option group if it was empty',
      ()=> {
        viewModel.attr('assessmentTemplate', null);
        viewModel._selectInitialTemplate(templates);
        expect(viewModel.attr('assessmentTemplate')).toEqual('foo');
      });

    it('leaves item if the option was not empty', ()=> {
      viewModel.attr('assessmentTemplate', 'template-123');
      viewModel._selectInitialTemplate(templates);
      expect(viewModel.attr('assessmentTemplate')).toEqual('template-123');
    });

    it(`leaves the current template unchanged if only a dummy value in
      the templates list`,
      ()=> {
        viewModel.attr('assessmentTemplate', 'template-123');
        templates.splice(1); // keep only the 1st (dummy) option

        viewModel._selectInitialTemplate(templates);

        expect(viewModel.attr('assessmentTemplate')).toEqual('template-123');
      });

    it('leaves the current template unchanged if first object group empty',
      ()=> {
        viewModel.attr('assessmentTemplate', 'template-123');
        templates[1].subitems.length = 0;
        spyOn(console, 'warn'); // just to silence it

        viewModel._selectInitialTemplate(templates);

        expect(viewModel.attr('assessmentTemplate')).toEqual('template-123');
      }
    );

    it('issues a warning if an empty group is encountered', ()=> {
      const expectedMsg = [
        'GGRC.Components.assessmentTemplates: ',
        'An empty template group encountered, possible API error',
      ].join('');

      spyOn(console, 'warn');
      templates[1].subitems.length = 0;

      viewModel._selectInitialTemplate(templates);

      expect(console.warn).toHaveBeenCalledWith(expectedMsg);
    });

    it('selects the first non-dummy value if it precedes all object groups',
      ()=> {
        viewModel.attr('assessmentTemplate', null);
        templates.splice(1, 0, {title: 'No Group Template', value: 'single'});

        viewModel._selectInitialTemplate(templates);

        expect(viewModel.attr('assessmentTemplate')).toEqual('single');
      }
    );
  });
});
