let time = Date.now();
function debug(...args) {
  let elapsed = Date.now() - time;
  let elapsedString = elapsed > 1000000 ? '...    ' : (('     ' + elapsed).slice(-6) + '  ')
  time = Date.now();
  console.log(elapsedString, ...args);
}

class MkTreeNode {
  constructor(props) {
    this.state = {
      id: props.id,
      parent: props.parent || null,
      data: props.data || null,
      filters: props.filters || {},
      children: []
    }
    this.toString = function() {
      return props.id;
    }
  }

  addChild(node) {
    //TODO allow reordering
    this.state.children.push(node);
    node.setParent(this);
  }

  setParent(node) {
    this.state.parent = node;
  }
  
  addFilter(name, filter) {
    this.state.filters[name] = filter;
  }
  
  removeFilter(name, filter) {
    delete this.state.filters[name];
  }

  getNodeCount(includeSelf = true) {
    return this.isIncluded() ? this.getDescendents(null, includeSelf).length : 0;
  }
  
  isIncluded(root = this.getRoot()) {
    return this.isIncludedSelf(root) || this.isIncludedFirstDescendent(root);
  }
  
  isIncludedSelf(root = this.getRoot()) {
    return Object.values(this.getFilters()).reduce((acc, f) => (acc && f(this)), true);
  }
  
  isIncludedDescendents(root = this.getRoot()) {    
    return this.getDescendents(null, false).some(node=>{
      return node.isIncluded(root);
    });
  }
  
  isIncludedFirstDescendent(root = this.getRoot()) {    
    return this.getFirst(node=>{
      return node.isIncludedSelf(root);
    }, false) !== null;
  }

  getFilters() {
      if (this.isRoot()) {
          return Object.assign({}, this.state.filters);
      } else {
          let pf = this.getParent().getFilters();
          if (Object.values(this.state.filters).length > 0) {
            Object.keys(this.state.filters).forEach(key=>{
              pf[key] = this.state.filters[key];
            });
          }
          return pf;
      }
  }

  getMaxDepth() {
    if (this.getChildren().length == 0) {
      return 0;
    } else {
      return 1 + this.getChildren().map(n => n.getMaxDepth()).reduce(( max, cur ) => Math.max( max, cur ), 0);
    }
  }

  getRootDistance(root = this.getRoot()) {
    return this === root ? 0 : 1 + this.getParent().getRootDistance(root);
  }

  getLevelNodes(root = this.getRoot()) {
    return root.getDescendents(this.getRootDistance(), true);
  }

  getChildren(unfiltered = false) {
    return this.state.children.filter(c => unfiltered  || (c.isIncluded()));
  }

  sortChildren(sortFunction) {
    return this.state.children.sort(sortFunction);
  }

  /**
  requires full tree traversal. NOT FILTERED.
   */
  getDescendents(level = null, includeSelf = false) {
    let collector = [];
    let self = this;
    this.dft((node) => {
      if ((level === null || node.getRootDistance() == level) && (includeSelf || node != self)) {
        collector.push(node);
      }
    });
    return collector;
  }
  
  getFirst(predicate, includeSelf = true) {
    let value = (includeSelf && predicate.call(this, this)) ? this : null;
    if (value === null) {
      let children = this.getChildren(true);
      for (let index in children){
        value = children[index].getFirst(predicate);
        if (value !== null) {
          return value;
        }
      }
    }
    return value;
  }

  getParent(root = this.getRoot()) {
    return this.isRoot(root) ? null : this.state.parent;
  }

  isRoot(root = this.getRoot()) {
    return this === root;
  }

  getRoot() {
    return this.state.parent === null ? this : this.state.parent.getRoot();
  }

  getAncestors() {
    if (this.isRoot()) {
      return [];
    } else {
      let a = this.getParent().getAncestors();
      a.unshift(this.getParent());
      return a;
    }
  }

  /**
    visits all nodes regardless of whether they are included based on filters
   */
  dft(func, args = {}, ref) {
    //call function, update args based on function call return value
    args = func.call(ref, this, args);
    this.getChildren().forEach(c => {
      c.dft(func, args, ref);
    });
  }
}
/*
class MkForest {
  constructor() {
    this.state = {
      nodes: {}
    }
  }

  addNode(node) {
    this.state.nodes[node.id] = node;
  }

  getRoots() {
    return Object.values(this.state.nodes).filter(n=>n.isRoot());
  }

  getNodes() {
    return this.state.nodes;
  }

  getMaxDepth() {
    return Object.values(this.state.nodes).filter(n=>n.isRoot()).map(n=>n.getMaxDepth()).reduce(( max, cur ) => Math.max( max, cur ), 0);
  }

  dft(func, args = {}, node = null) {
    if (node == null) {
      this.getRoots().forEach(n => {
        n.dft(func, args, n);
      });
    }
  }
}
*/
const MIN_RADIUS_CENTER_TEXT = 0;
const MIN_RADIUS_LABEL = 6;

class MkTreeView {

  constructor(props) {
    this.state = {
      //forest: props.forest,
      root: props.root,
      colorFunction: props.colorFunction || function(d) {
        return '#999';
      },
      label: props.label || function(d) {
        return d.node.state.id;
      },
      infoBox: props.infoBox || function(d) {
          return d.node.state.data;
      },
      title: props.title || 'Tree',
      filters: props.filters || {},
      filtersOn: [],
      searchTerms: props.searchTerms || null,
      focusNodes: props.focusNodes || []
    }

    let view = this;
    this.svg = d3.select("body").append("svg")
      .attr("id", 'graph_svg')
      .on('click', function(){
        view.setState({
          focusNodes: []
        })
      })
    this.svg.on('mouseover', d=>{view.hover()});
    this.container = this.svg.append('g');

    this.sideBar = d3.select("body").append("div")
      .attr("id", 'info_box');

    this.searchBox = this.sideBar.append('input').attr('class', 'info_element')
      .attr('placeholder', 'search graph');
    
    this.searchBox.on('keypress', function(e){
      if (!e) e = window.event;
      var keyCode = e.keyCode || e.which;
      if (keyCode == '13'){
        view.search(view.searchBox.property('value'));
        return false;
      }
    })

    this.titleBox = this.sideBar.append('div').attr('class', 'info_element');
    this.titleBox.append('h2').attr('id', 'info_box_title');

    this.infoBox = this.sideBar.append('table').attr('class', 'info_element');

    let tooltip = d3.select("body").append("span")
      .attr("id", 'tooltip');
    this.tooltip = tooltip;
    d3.select("body").on('mousemove', function(){
      tooltip
        .style("left", (d3.event.pageX + 28) + "px")		
        .style("top", (d3.event.pageY + 28) + "px");	
    })
    
    this.updateFocus = this.updateFocus.bind(this);
    this.search = this.search.bind(this);
    this.hover = this.hover.bind(this);
  }

  setState(newState) {
    let changed = [];
    for (let key in newState) {
      if (this.state[key] != newState[key]) {
        changed.push(key);
        this.state[key] = newState[key];
      }
    }
    if (changed.length > 0) {
      this.draw(changed);
    }
  }

  search(criteria) {
    window.criteria = criteria;
    debug('search!!!', criteria);
    //search
    let terms = [criteria.toLowerCase()];
    if (terms[0].includes(';')){
      terms = terms[0].split(';').map(e=>(e.includes('<') ?e.split('<')[1].split('>')[0]: e))
    }
    let nodes = [];
    root.dft(function(node){
      // search
      for (let key in node.state.data) {
        if ((this.state.searchTerms == null || this.state.searchTerms.includes(key)) && terms.some(term=>(node.state.data[key].toLowerCase().includes(term)))) {
          //debug('found',node.state.data[key],node);
          nodes.push(node);
          return;
        }
      }
    }, {}, this);
    this.setState({
      focusNodes: nodes
    })
  }

  //called by setState. also should be called when setState is not called but graph should be rerendered.
  draw(changed) {
    //todo add loading spinner
    var d = this.getDimensions();

    this.svg
      .attr("width", d.width)
      .attr("height", d.height)
      .attr("tabindex", 1);

    let redraw = !changed || changed.includes('root');
    this.updateFocus(redraw);
    //todo remove loading spinner
  }
  /*
    this.drawKey();
    this.drawLevels();
  }

  drawKey() {

  }

  drawLevels() {

  }
  */
  levelPath(dimensions, margin, level, levelNodes, maxLevel) {
    let w = dimensions.graphWidth - margin.l - margin.r;
    let h = dimensions.height - margin.t - margin.b;
    let frac = (1 - 3/(level + 3));
    let maxFrac = maxLevel == 0 ? 1 :(1 - 3/(maxLevel + 3));

    //linear
    let m = h/(w * 1.0);
    let b = h * frac/maxFrac;
    let xmax = w * frac/maxFrac;
    let length = xmax / Math.cos(Math.atan(m));

    //TODO make this return type a class
    return {
      length: length,
      position: function(node) {
        const LABEL_SIZE_FACTOR = 2;
        const LABEL_SIZE_DEFAULT = 10;
        let index = levelNodes.indexOf(node);
        let x = xmax * (1.0 * index + 0.5) / (levelNodes.length);
        if (isNaN(x)) {
          console.log('something went wrong', level, levelNodes.length, maxLevel, xmax, maxFrac);
        }
        let radius = 20 / (level + 1);
        let labelSize = (radius * LABEL_SIZE_FACTOR > LABEL_SIZE_DEFAULT)
          ? LABEL_SIZE_DEFAULT + 'px'
          : radius*LABEL_SIZE_FACTOR + 'px';
        //TODO never have a deeper level more spread out than it's parent level
        return {
          node: node,
          label: radius > MIN_RADIUS_LABEL || ((length / (radius * levelNodes.length)) > 3 && radius > 3),
          labelSize: labelSize,
          r: radius,
          x: margin.l + x + radius,
          y: margin.t - m * x + b + radius,
          angle: Math.atan(1/m)*180/Math.PI
        }
      }
    }
  }
  
  hover(node) {
    d3.event.stopPropagation();
    if (node) {
      //TODO set Name as a state property of the view or of the node
      this.tooltip
        .style('display', 'inline-block')
        .text(node.state.data.Name);
    } else {
      this.tooltip
        .style('display', 'none')
        .text('');
    }
  }

  //called by updateFocus if it's determined that nodes/edges should be redrawn
  drawEdgesAndNodes() {
    let view = this;
    let edges = [];
    let nodes = {};
    let dimensions = this.getDimensions();
    let root = this.state.root;
    let ancestors = root.getAncestors()
    let maxDepth = root.getMaxDepth() + root.getRootDistance();

    let margins = {
      l: 24,
      r: 24,
      t: ancestors.length == 0 ? 24 : 54,
      b: 24
    };

    debug('start dft');
    let child = root;
    while (child) {
      let levelNodes = child.getLevelNodes(root);
      let level = child.getRootDistance(root);
      //console.log('dft level nodes', levelNodes);
      child = null;
      let totalbreadth = 0;
      let levelPath = this.levelPath(dimensions, margins, level, levelNodes, maxDepth);
      levelNodes.forEach(function(node){
        nodes[node.state.id] =  levelPath.position(node);
        if (!node.isRoot(root) && node.getParent(root).state.id in nodes) {
          edges.push([nodes[node.getParent(root).state.id], nodes[node.state.id]]);
        }
        if (!child && node.getChildren().length > 0) {
          child = node.getChildren()[0];
        }
        totalbreadth += 2 * nodes[node.state.id].r;
      });
      //TODO handle case where level 1 does not have enough spread (there's no way to see all those nodes ever)
      if (level > 1 && totalbreadth > levelPath.length + 100) {
        let lastParent;
        let lastColor;
        let lastNonHidden;
        levelNodes.forEach(function(node){
          if (lastParent && lastColor && lastParent == node.getParent() && lastColor == view.state.colorFunction({node: node})) {
            nodes[node.state.id]['isHidden'] = true;
            lastNonHidden.span = nodes[node.state.id];
          } else {
            lastParent = node.getParent();
            lastColor = view.state.colorFunction({node: node});
            lastNonHidden = nodes[node.state.id];
          }
        });
      }
    }
    debug('end dft');

    let last = nodes[root.state.id];

    nodes = Object.values(nodes);
    let ancestorRadius = 20;
    ancestors.forEach((node, i) => {
      let n = {
        node: node,
        label: true,
        labelSize: 10,
        angle: 0,
        r: ancestorRadius,
        x: i*2.5*ancestorRadius + margins.l + ancestorRadius,
        y: margins.b // use bottom margin, since these are the nodes along the top
      }
      nodes.push(n)
      edges.push([n, last])
      last = n;
    })
    
    const CLASSES = {
        line: 'edge'
      };
    var line = d3.line()
      .x(d=>d.x)
      .y(d=>d.y);

    let t = this.svg.transition().duration(750);

    //EDGES
    var edge = this.container.selectAll("path." + CLASSES.line)
      .data(edges.filter(edge => {
        return !(edge[1].isHidden) && !('span' in edge[1]);
      }), d => {
        return `${d[0].node.state.id},${d[1].node.state.id}`;
      });

    edge.exit().remove();

    edge.enter().append("path")
      .attr("class", CLASSES.line)
      .style('stroke', d=>{
        return view.state.colorFunction(d[1]);
      })
      .style('stroke-width','1.5px')
      .style('opacity',0)
      .transition(t)
          .delay(500)
        .style('opacity', d => d[0].node.isIncludedSelf() ? 0.5 : 0.1)
          .selection()
    .merge(edge)
      .transition(t)
        .style('opacity', d => d[0].node.isIncludedSelf() ? 0.5 : 0.1)
        .attr("d", function(a) {
          return line(a);
        });

    /*GROUP EDGES*/
    var groupEdges = this.container.selectAll("polygon.group_edge")
      .data(edges.filter(d => {
        return 'span' in d[1];
      }), d => {
        if (!d[0] || !d[1]) {
          console.log('problems', d);
        }
        return `${d[0].node.state.id},${d[1].node.state.id}`;
      });

    groupEdges.exit().remove();

    groupEdges.enter().append("polygon")
      .attr("class", 'group_edge')
      .classed('clickable', true)
      .style('fill', d=>{
        return view.state.colorFunction(d[1]);
      })
      .style('opacity',0)
      .on('mouseover', function(d) {
        view.hover(d[0].node);
      })
      .on('click', function(d) {
        view.setState({
          focusNodes: [d[0].node]
        })
        d3.event.stopPropagation();
      })
      .on('dblclick', function(d) {
        view.setState({
          root: d[0].node
        })
      })
      .transition(t)
          .delay(500)
        .style('opacity', d => d[0].node.isIncludedSelf() ? 0.5 : 0.1)
          .selection()
    .merge(groupEdges)
      .transition(t)
        .attr("points", function(e) {
          let a = e[0];
          let b = e[1];
          let c = e[1].span;
          return [a, b, c].map(node => [node.x, node.y].join(',')).join(' ')
        })
        .style('opacity', d => d[0].node.isIncludedSelf() ? 0.5 : 0.1);

    //TODO don't remove till after transition?

    //GROUP NODES
    var groupNodes = this.container.selectAll("polygon.group_node")
      .data(nodes.filter(d => {
        return 'span' in d;
      }), d => d.node.state.id);

    groupNodes.exit().remove();

    groupNodes.enter().append("polygon")
      .attr("class", 'group_node')
      .classed('clickable', true)
      .style('fill', view.state.colorFunction)
      .style('opacity',0)
      .on('mouseover', function(d) {
        view.hover(d.node.getParent());
      })
      .on('click', function(d) {
        view.setState({
          focusNodes: [d.node.getParent()]
        })
        d3.event.stopPropagation();
      })
      .on('dblclick', function(d) {
        view.setState({
          root: d.node.getParent()
        })
      })
      .transition(t)
          .delay(500)
        .style('opacity', d => d.node.getParent().isIncludedSelf() ? 1 : 0.2)
          .selection()
    .merge(groupNodes)
      .transition(t)
        .attr("points", function(n) {
          let a = {x:n.x-n.r,y:n.y-n.r};
          let b = {x:n.x+n.r,y:n.y+n.r};
          let c = {x:n.span.x+n.r,y:n.span.y+n.span.r};
          let d = {x:n.span.x-n.r,y:n.span.y-n.span.r};
          return [a, b, c, d].map(point => [point.x, point.y].join(',')).join(' ')
        })
        .selection().raise();
    //*/    
    //NODES
    //https://threejs.org/examples/#webgl_materials_texture_rotation for color cube
    //TODO make this a group with the rect and text https://stackoverflow.com/questions/9206732/how-to-add-compound-node-in-a-d3-force-layout
    //g should be centered on d.x,d.y using transform rect and text should be centered on 0
    //click, dblclick, hover, etc events should all happen on group
    //enter shouldn't happen until after move because it can be very slow. can enter happen in callback?
    // start implementing https://www.opm.gov/policy-data-oversight/data-analysis-documentation/federal-employment-reports/reports-publications/sizing-up-the-executive-branch-2015.pdf
    //https://en.wikipedia.org/wiki/Organizational_structure_of_the_United_States_Department_of_Defense
    var circle = this.container.selectAll("rect")
      .data(nodes.filter(node => {
        return (!node.isHidden && !('span' in node)) || view.state.focusNodes.includes(node.node);
      }), d => d.node.state.id);

    debug('start circle with focusNodes', view.state.focusNodes);
    circle.exit().remove();
    circle
      .classed('focus', d=>(view.state.focusNodes.includes(d.node)))
      .transition(t)
          .attr("x", function(d) {
            return d.x - d.r;
          })
          .attr("y", function(d) {
            return d.y - d.r;
          })
          .attr("width", function(d){
            return d.r * 2;
          })
          .attr("height", function(d){
            return d.r * 2;
          })
          .style('opacity', d => d.node.isIncludedSelf() ? 1 : 0.2)
          .style('fill', view.state.colorFunction)
      .selection().raise();

    circle.enter().append("rect")
      .classed('node', true)
      .classed('clickable', true)
      .classed('focus', d=>(view.state.focusNodes.includes(d.node)))
      .on('mouseover', function(d) {
        view.hover(d.node);
      })
      .on('click', function(d) {
        view.setState({
          focusNodes: [d.node]
        })
        d3.event.stopPropagation();
      })
      .on('dblclick', function(d) {
        view.setState({
          root: d.node
        })
      })
      .attr('id', d => d.node.state.id)
      //TODO figure out how d3 interpolates data
      //.attr("transform", d=>`rotate(${d.angle || 0} ${d.x} ${d.y}) `)
      .attr("x", function(d) {
        return d.x - d.r;
      })
      .attr("y", function(d) {
        return d.y - d.r;
      })
      .attr("width", function(d){
        return d.r * 2;
      })
      .attr("height", function(d){
        return d.r * 2;
      })
      .style('fill', view.state.colorFunction)
      .style('opacity',0)
      .transition(t)
          .delay(500)
        .style('opacity', d => d.node.isIncludedSelf() ? 1 : 0.2)
      .selection().raise();

    //LABELS
    var nodelabels = this.container.selectAll("text")
      .data(nodes.filter(d => {
        return d.label;
      }), d => d.node.state.id);

    nodelabels.exit().remove();

    nodelabels.enter().append("text")
      .attr("class", 'nodelabel')
      .classed('clickable', true)
      .on('mouseover', function(d) {
        view.hover(d.node);
      })
      .on('click', function(d) {
        view.setState({
          focusNodes: [d.node]
        })
        d3.event.stopPropagation();
      })
      .on('dblclick', function(d) {
        view.setState({
          root: d.node
        })
      })
      .text(view.state.label)
      .attr("text-anchor", function(d) {
        return d.r > MIN_RADIUS_CENTER_TEXT ? "middle" : "start";
      })
      .attr("alignment-baseline", function(d) {
        return d.r > MIN_RADIUS_CENTER_TEXT ? "middle" : "bottom";
      })
      .attr("x", function(d){
        if (d.r > MIN_RADIUS_CENTER_TEXT) {
          return d.x;
        }
        return d.x + d.r;
      })
      .attr("y", function(d){
        if (d.r > MIN_RADIUS_CENTER_TEXT) {
          return d.y;
        }
        return d.y - d.r;
      })
      .style('opacity',0)
      .transition(t)
          .delay(500)
        .style('opacity', d => d.node.isIncludedSelf() ? 1 : 0.8)
          .selection()
    .merge(nodelabels)
      .style('font-size', d => d.labelSize)
      .attr("text-anchor", function(d) {
        return d.r > MIN_RADIUS_CENTER_TEXT ? "middle" : "start";
      })
      .attr("alignment-baseline", function(d) {
        return d.r > MIN_RADIUS_CENTER_TEXT ? "middle" : "bottom";
      })
      .style('fill', d=> {
          let c = d3.color(view.state.colorFunction(d));
          return (d.r <= MIN_RADIUS_CENTER_TEXT || (c.opacity * (c.r + c.g + c.b)/3 > 128)) ? '#000' : '#CCC';
      })
      .transition(t)
        .style('opacity', d => d.node.isIncludedSelf() ? 1 : 0.8)
        .attr("x", function(d){
          if (d.r > MIN_RADIUS_CENTER_TEXT) {
            return d.x;
          }
          return d.x + d.r;
        })
        .attr("y", function(d){
          if (d.r > MIN_RADIUS_CENTER_TEXT) {
            return d.y;
          }
          return d.y - d.r;
        })
        .selection().raise();

    debug('end draw', 'dom length=', document.body.getElementsByTagName("*").length);
    
  }

  //called by draw
  updateFocus(shouldRedraw = true) {
    debug('start infoBox', this.state.focusNodes);
    let view = this;
    this.container.selectAll("rect")
      .classed('focus', d=> (view.state.focusNodes.includes(d.node)));

    view.state.focusNodes.forEach(node => {
      shouldRedraw = shouldRedraw || (view.container.selectAll('rect#' + node.state.id).size() == 0);
    });
    
    let labelClass = 'label';
    let info;
    if (this.state.focusNodes.length > 1) {
      //more than one focus node
      labelClass = 'label_narrow';
      info = new InfoBox({
        title: "found " + this.state.focusNodes.length + ' results'
      });
      this.state.focusNodes.forEach((node, i) => {
        let ib = this.state.infoBox(node);
        info.state.links[i + ':'] = node;
        info.state.data[i + ':'] = ib.state.title;
        info.state.data[i + ' '] = Object.keys(ib.state.data).filter(k=>ib.state.limitedKeys.includes(k)).map(k=>ib.state.data[k]).join('; ');
      });
    } else if (this.state.focusNodes.length == 1) {
      //one focus node
      info = this.state.infoBox(this.state.focusNodes[0]);
      console.log(info);
      if (Object.keys(info.state.data).length == 0) {
        info.state.data = {data: '<empty>'};
      };
    } else {
      //no focus node
      //TODO consider possibility that this is a failed search
      let data = {};
      let links = {};
      //todo fix this for case that 'focus' filter is on
      data['nodes visible'] = this.state.root.getNodeCount(true) + this.state.root.getRootDistance();
      data['levels visible'] = this.state.root.getMaxDepth() + 1;
      Object.keys(view.state.filters).forEach(filterName=>{
        let filterKey = 'filter by ' + filterName;
        if (!(filterName in view.state.root.getRoot().getFilters())) {
          data[filterKey] = filterName;
          links[filterKey] = function(){
            view.state.root.getRoot().addFilter(filterName, view.state.filters[filterName]);
            view.draw();
          }
        } else {
          data[filterKey] = 'remove filter ' + filterName;
          links[filterKey] = function(){
            view.state.root.getRoot().removeFilter(filterName);
            view.draw();
          }
        }
      })
      info = new InfoBox({
        title: this.state.title,
        data:  data,
        links: links
      });
    }
    
    //Set Title
    var title = this.titleBox.selectAll("h2#info_box_title").data([info.state.title]).text(d=>d);
   
    //Set filters
    let offtree = this.state.focusNodes.filter(node=>!(node == view.state.root || node.getAncestors().includes(view.state.root)));
    console.log('filters',view.state.root.getRoot().getFilters());
    let options = [];
    if (offtree.length > 0) {
      options.push(['show all results', function(){
        view.state.root.getRoot().removeFilter('focus');
        view.setState({
          root: view.state.root.getRoot()
        });
      }]);
    }
    if ('focus' in view.state.root.getRoot().getFilters()) {
      options.push(['don\'t filter to focus', function(){
        view.state.root.getRoot().removeFilter('focus');
        view.draw();
      }]);
    } else if (view.state.focusNodes && view.state.focusNodes.length > 0) {
      options.push(['filter to focus', function(){
        view.state.root.getRoot().addFilter('focus', function(node) {
          return view.state.focusNodes.includes(node);// || node.getAncestors().some(a=>(view.state.focusNodes.includes(a)));
        });
        view.draw();
        d3.event.preventDefault();
      }]);
    }
    var link = this.titleBox.selectAll("a.info_box_filter").data(options);
    link.exit().remove();
    link.enter().append('a')
      .attr('class', 'info_box_filter')
      .attr('href', '#')
    .merge(link)
      .text(d=>d[0])
      .on('click', d=>{
        d[1]();
        d3.event.stopPropagation();
      });
    //var filterLink = this.sideBar.select("a#info_box_title").data([info.state.title]);

    var entries = this.infoBox.selectAll("tr").data(Object.keys(info.state.data));

    entries.exit().remove();

    let rows = entries.enter().append("tr")
      .attr("class", 'datum')
    .merge(entries)
    entries = rows.selectAll('td')
      .data(function (row) {
        let link = info.state.links[row];
        if (link) {
          return [[row, labelClass], [info.state.data[row], 'link', link]]
        } else {
          return [[row, labelClass], [info.state.data[row]]]
        }
      })
    entries
      .enter()
          .append('td')
      .merge(entries)
          .html(d => d[0])
          .attr('class', d=>(d.length > 1 ? d[1] : null))
          .on('click', d=>{
            if (d.length > 2) {
              let link = d[2];
              if (Array.isArray(link)) {
                view.setState({
                  focusNodes: link
                })
              } else if (typeof link == 'function') {
                link.call(view);            
              } else {
                view.setState({
                  root: link
                })                
              }
            }
            d3.event.stopPropagation();
          })
          .on('dblclick', d=>{
            if (d.length > 2) {
              if (Array.isArray(d[2])) {
                //do nothing
              } else if (typeof link == 'function') {
                //do nothing
              } else {
                view.setState({
                  focusNodes: [d[2]]
                })                
              }
            }
          })
    debug('end infoBox')
    if (shouldRedraw) {
      this.drawEdgesAndNodes();
    }
  }

  getDimensions() {
    return {
      width: window.innerWidth,
      graphWidth: window.innerWidth * 0.66,
      height: window.innerHeight -
        (document.getElementById('graph_svg').getBoundingClientRect().top -
          document.body.getBoundingClientRect().top)
    }
  }
}

class InfoBox{
  constructor(props = {}) {
    this.state = {
      title: props.title || null,
      data: props.data || {},
      limitedKeys: props.limitedKeys || {},
      links: props.links || {}
    }
  }
}

debug('loaded script');
