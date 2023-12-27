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

Spider.addPipetype('except', function(graph, args, gremlin, state) { // unfinished
    if(!gremlin) return 'pull'
    if(gremlin.vertex)
})

Spider.error = function(msg) { 
    console.log(msg) // when showing few results is preferred, override this to throw an error
    return false
  }
