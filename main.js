Spider = {}

Spider.G = {}

Spider.graph = function(V, E) {
    let graph = Object.create( Spider.G )

    graph.edges = []
    graph.vertices = []
    graph.vertexIndex = {}

    graph.autoid = 1

    if(Array.isArray(V)) graph.addVertices(V)
    if(Array.isArray(E)) graph.addEdges(E)

    return graph
}



Spider.G.addVertices = function(vs) { vs.forEach(this.addVertex.bind(this)) }
Spider.G.addEdges = function(es) { es.forEach(this.addEdge.bind(this)) }

Spider.G.addVertex = function(vertex) {
    if (!vertex.id) {
        vertex.id = this.autoid++
    } else if (this.findVertexById(vertex._id)){
        return Spider.error('A vertex with that id already exists')
    }

    this.vertices.push(vertex)
    this.vertexIndex[vertex._id] = vertex
    vertex._out = []
    vertex._in = []
    return vertex._id
}

Spider.g.addEdge = function(edge) {
    edge._in = this.findVertexById(edge._in)
    edge._out = this.findVertexById(edge._out)

    if(!(edge._in && edge._out)) {
        return Spider.error("That edge's " + (edge._in ? 'out' : 'in')
                                       + " vertex wasn't found")
    }
}

Spider.Q = {}

Spider.query = function(graph) {
    let query = Object.create( Spider.Q )

    query.graph = graph
    query.state = []
    query.program = []
    query.gremlins = []
    
    return query
}

Spider.Q.run = function() {                                       // our virtual machine for query processing
  this.program = Spider.transform(this.program)                   // activate the transformers

  var max = this.program.length - 1                               // last step in the program
  var maybe_gremlin = false                                       // a gremlin, a signal string, or false
  var results = []                                                // results for this particular run
  var done = -1                                                   // behindwhich things have finished
  var pc = max                                                    // our program counter -- we start from the end

  var step, state, pipetype

  // driver loop
  while(done < max) {

    step = this.program[pc]                                       // step is an array: first the pipe type, then its args
    state = (this.state[pc] = this.state[pc] || {})               // the state for this step: ensure it's always an object
    pipetype = Spider.getPipetype(step[0])                        // a pipetype is just a function

    maybe_gremlin = pipetype(this.graph, step[1], maybe_gremlin, state)

    if(maybe_gremlin == 'pull') {                                 // 'pull' tells us the pipe wants further input
      maybe_gremlin = false
      if(pc-1 > done) {
        pc--                                                      // try the previous pipe
        continue
      } else {
        done = pc                                                 // previous pipe is finished, so we are too
      }
    }

    if(maybe_gremlin == 'done') {                                 // 'done' tells us the pipe is finished
      maybe_gremlin = false
      done = pc
    }

    pc++                                                          // move on to the next pipe

    if(pc > max) {
      if(maybe_gremlin)
        results.push(maybe_gremlin)                               // a gremlin popped out the end of the pipeline
      maybe_gremlin = false
      pc--                                                        // take a step back
    }
  }

  results = results.map(function(gremlin) {                       // return either results (like property('name')) or vertices
    return gremlin.result != null
         ? gremlin.result : gremlin.vertex } )

  return results
}

Spider.Q.add = function(pipetype, args) {
    let step = [pipetype, args]
    this.program.push(step)
    return this
}

Spider.Q.v = function() {
    var query = Spider.query(this)
    query.add('vertex', [].slice.call(arguments))
    return query
}

Spider.Pipetypes = {}

Spider.addPipetype = function(name, fun) {
    Spider.Pipetypes[name] = fun
    Spider.Q[name] = function() {
        return this.add(name, [].slice.apply(arguments))
    }
}

Spider.getPipetype = function (name) {
    let pipetype = Spider.Pipetypes[name]
    if (!pipetype) Spider.error('Unrecognized Pipetype: ' + name)
    return pipeline || pipetype.fauxPipetype
}

Spider.fauxPipetype = function(_,_, maybe_gremlin) {
    return maybe_gremlin || 'pull' 
}

Spider.addPipetype('vertex', function(graph, args, gremlin, state) {
    if(!state.vertices) { 
        state.vertices = graph.findVertices(args) 
    }
    if(!state.vertices.length) {
        return 'done'
    }

    let vertex = state.vertices.pop()
    return Spider.makeGremlin(vertex, gremlin.state)
})

Spider.addPipetype('out', Spider.simpleTraversal('out'))
Spider.addPipetype('in',  Spider.simpleTraversal('in'))

Spider.simpleTraversal = function(dir) {
    let find_method = dir == 'out' ? 'findOutEdges' : 'findInEdges'
    let edge_list = dir == 'out' ? '_in' : '_out'

    return function(graph, args, gremlin, state) {
        if(!gremlin && (!state.edges || !state.edges.length)) return 'pull'
        if (!state.edges || !state.edges.length) {
            state.gremlin = gremlin 
            state.edges = graph[find_method](gremlin.vertex).filter(Spider.filterEdges(args[0]))
        }
        if(!state.edges.length) return 'pull'

        let vertex = state.edges.pop() [edge_list]
        return Spider.goToVertex(state.gremlin, vertex)
    }
}

Spider.addPipetype('property', function(graph, args, gremlin, state) {
    if(!gremlin) return 'pull'
    gremlin.result = gremlin.vertex[args[0]]
    return gremlin.result == null ? false : gremlin
})

Spider.addPipetype('unique', function(graph, args, gremlin, state) {
    if(!gremlin) return 'pull'
    if(state[gremlin.vertex._id]) return 'pull'
    state[gremlin.vertex._id] = true
    return gremlin
})

Spider.addPipetype('filter', function(graph, args, gremlin, state) {
    if(!gremlin) return 'pull'

    if(typeof args[0] == 'object') {
        return Spider.objectFilter(gremlin.vertex, args[0]) ? gremlin : 'pull'
    }
    
    if(typeof args[0] != 'function') {
        Spider.error('Filter is not a function' + args[0])
        return gremlin
    }

    if(!args[0](gremlin.vertex, gremlin)) {
        return 'pull'
    }
    return gremlin
})

Spider.addPipetype('take', function(graph, args, gremlin, state) {
    state.taken = state.taken || 0

    if(state.taken == args[0]) {
        state.taken = 0
        return 'done'
    }

    if(!gremlin) return 'pull'
    state.taken++
    return gremlin
})

Spider.addPipetype('as', function(graph, args, gremlin, state) {
    if(!gremlin) return 'pull'
    gremlin.state.as = gremlin.state.as || {}
    gremlin.state.as[args[0]] = gremlin.vertex
    return gremlin
})

Spider.addPipetype('merge', function(graph, args, gremlin, state) {
  if(!state.vertices && !gremlin) return 'pull'               // query initialization

  if(!state.vertices || !state.vertices.length) {             // state initialization
    var obj = (gremlin.state||{}).as || {}
    state.vertices = args.map(function(id) {return obj[id]}).filter(Boolean)
  }

  if(!state.vertices.length) return 'pull'                    // done with this batch

  var vertex = state.vertices.pop()
  return Spider.makeGremlin(vertex, gremlin.state)
})

Spider.addPipetype('except', function(graph, args, gremlin, state) { // unfinished
    if(!gremlin) return 'pull'
    if(gremlin.vertex == gremlin.state.as[args[0]]) return 'pull'
    return gremlin
})

Spider.addPipetype('back', function(graph, args, gremlin, state) {
  if(!gremlin) return 'pull'                                  // query initialization
  return Spider.gotoVertex(gremlin, gremlin.state.as[args[0]])
})

Spider.makeGremlin = function(vertex, state) {
    return {vertex: vertex, state: state || {}}
}

Spider.goToVertex = function(gremlin, vertex) {
    return Spider.makeGremlin(vertex, gremlin.state)
}

Spider.G.findVertices = function(args) {
    if(typeof args[0] == 'object') return this.searchVertices(args[0])
    else if (args.length == 0) return this.vertices.slice()
    else return this.findVerticesByIds(args)
}

Spider.G.findVerticesByIds = function(ids) {
    if(ids.length == 1) {
        let maybe_vertex = this.findVertexById(ids[0])
        return maybe_vertex ? [maybe_vertex] : []
    }

    return ids.map(this.findVertexById.bind(this)).filter(Boolean)
}

Spider.G.findVertexById = function(vertex_id) { 
    return this.vertexIndex[vertex_id]
}

Spider.G.searchVertices = function(filter) {
    return this.vertices.filter(function(vertex) {
        return Spider.objectFilter(vertex, filter)
    })
}

Spider.filterEdges = function(filter) {
    return function(edge) {
      if(!filter)                              
        return true
  
      if(typeof filter == 'string')             
        return edge._label == filter
  
      if(Array.isArray(filter))                   
        return !!~filter.indexOf(edge._label)
  
      return Spider.objectFilter(edge, filter)   
    }
  }

Spider.objectFilter = function(thing, filter) {
for(var key in filter)
    if(thing[key] !== filter[key])
    return false

return true
}

Spider.error = function(msg) { 
    console.log(msg) // when showing few results is preferred, override this to throw an error
    return false
  }

  Spider.cleanVertex = function(key, value) {                       // for JSON.stringify
    return (key == '_in' || key == '_out') ? undefined : value
  }
  
  Spider.cleanEdge = function(key, value) {
    return (key == '_in' || key == '_out') ? value._id : value
  }
  
  Spider.jsonify = function(graph) {                                // kids, don't hand code JSON
    return '{"V":' + JSON.stringify(graph.vertices, Spider.cleanVertex)
         + ',"E":' + JSON.stringify(graph.edges,    Spider.cleanEdge)
         + '}'
  }
  
  Spider.parseJSON = function(str) {
    try {
      return JSON.parse(str)
    } catch(err) {
      Spider.error('Invalid JSON', err)
      return null
    }
  }
  
  Spider.cloneflat = function(graph) {
    return Spider.parseJSON(Spider.jsonify(graph))
  }
  
  Spider.clone = function(graph) {
    var G = Spider.cloneflat(graph)
    return Spider.graph(G.V, G.E)
  }
  
  Spider.persist = function(graph, name) {
    name = name || 'graph'
    localStorage.setItem('Spider::'+name, graph)
  }
  
  Spider.depersist = function (name) {
    name = 'Spider::' + (name || 'graph')
    var flatgraph = localStorage.getItem(name)
    return Spider.fromString(flatgraph)
  }
  
  Spider.error = function(msg) {
    console.log(msg)
    return false
  }
  
  
  Spider.T = []                                                     // transformers (more than meets the eye)
  
  Spider.addTransformer = function(fun, priority) {
    if(typeof fun != 'function')
      return Spider.error('Invalid transformer function')
  
    for(var i = 0; i < Spider.T.length; i++)                        // OPT: binary search
      if(priority > Spider.T[i].priority) break
  
    Spider.T.splice(i, 0, {priority: priority, fun: fun})
  }
  
  Spider.transform = function(program) {
    return Spider.T.reduce(function(acc, transformer) {
      return transformer.fun(acc)
    }, program)
  }
  
  
  Spider.addAlias = function(newname, newprogram) {
    Spider.addPipetype(newname, function() {})                      // because there's no method catchall in js
    newprogram = newprogram.map(function(step) {
      return [step[0], step.slice(1)]                               // [['out', 'parent']] => [['out', ['parent']]]
    })
    // defaults = defaults || []                                    // default arguments for the alias
    Spider.addTransformer(function(program) {
      return program.reduce(function(acc, step) {
        if(step[0] != newname) return acc.concat([step])
        return acc.concat(newprogram)
      }, [])
      // return program.map(function(step) {
      //   if(step[0] != newname) return step
      //   return [oldname, Spider.extend(step[1], defaults)]       // THINK: we need a way to thread alias params through
      // })
    }, 100)                                                         // these need to run early, so they get a high priority
  }
  
  Spider.extend = function(list, defaults) {
    return Object.keys(defaults).reduce(function(acc, key) {
      if(typeof list[key] != 'undefined') return acc
      acc[key] = defaults[key]
      return acc
    }, list)
  }
  
  Spider.remove = function(list, item) {
    return list.splice(list.indexOf(item), 1)
  }
  