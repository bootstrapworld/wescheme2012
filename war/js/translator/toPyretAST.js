// if not defined, declare the compiler object as part of plt
window.plt   = window.plt || {};
plt.compiler = plt.compiler || {};

/*
 
 BSL AST -> Pyret AST
 follows definition from XXXXX
 
 */


(function () {
    'use strict';
 
    // empty location
    var blankLoc = {"startRow": 1, "startCol": 0, "startChar": 1
                    , "endRow": 1, "endCol": 0, "endChar": 1};
 
    // convertToPyret : [listof Programs],  -> JSON
    // generate pyret parse tree, preserving location information
    // follows http://www.pyret.org/docs/latest/s_program.html
    // provide and import will never be used
    function convertToPyret(programs){
      return { name: "program"
             , kids: [ {name: "prelude"
                        , kids: [/* TBD */]
                        , pos: blankLoc}
                      , {name: "block"
                        , kids: programs.map(function(p){return p.toPyret();})
                        , pos: programs.location}]
             , pos: programs.location};
    }
 
    // makeLetExprFromCouple : Racket Couple -> Pyret let-expr
    // used by Let, Let*, possibly others..
    function makeLetExprFromCouple(couple){
      return {name: 'stmt'
              , kids: [{name: 'let-expr'
                       , kids: [makeBindingFromSymbol(couple.first)
                                ,{name: 'EQUALS'
                                , value: '='
                                , key: '\'EQUALS:='
                                , pos: couple.location}
                                ,couple.second.toPyret()]
                       , pos: couple.location}]
              , pos: couple.location};
    }
 
    // given a symbol, make a binding (used for let-expr, fun-expr, lam-expr...)
    function makeBindingFromSymbol(sym){
      var loc = sym.location;
      return {name:'binding'
              , kids: [{name:'NAME'
                        ,value: sym.val
                        ,key:'\'NAME:'+sym.val
                        ,pos:loc}]
              , pos: loc};
    }

    // translates (f e1 e2 e3...) into (e1 f (e2 f (e3 ...)))
    // TODO: are some operators left-associative?
    function makeBinopTreeForInfixApplication(infixOperator, exprs){
      function addExprToTree(tree, expr){
        return {name:'binop-expr'
                , kids: [expr.toPyret(), infixOperator, tree]
                , pos: expr.location}
      }
      // starting with the firs expr, build the binop-expr tree
      var last = exprs[exprs.length-1], rest = exprs.slice(0, exprs.length-1);
      return rest.reduceRight(addExprToTree, last.toPyret());
    }
 
 
    // convert a symbol to a Pyret string or a Pyret boolean
    function makeLiteralFromSymbol(sym){
      var loc = sym.location, result, kid;
      if(["true", "false"].indexOf(sym.val) > -1){
        kid = (sym.val==="true")? {name:"TRUE", value:"true", key:"'TRUE:true", pos: loc}
                                  : {name:"FALSE", value:"false", key:"'FALSE", pos: loc};
        result = {name:"bool-expr", kids:[kid], pos: loc};
      } else {
        kid = {name:"STRING", value:'"'+sym.val+'"', key:"'STRING:\""+sym.val+"\"", pos:loc};
        result = {name:"string-expr", kids:[kid], pos: loc};
      }
      return {name:"expr", kids:[{name:"prim-expr", kids:[result], pos: loc}], pos: loc};
    }
 
    function makeArrayFromVectorCall(vectorCall){
      var loc = vectorCall.location,
          lBrackStx = {name: "LBRACK", value: "[", key: "'LBRACK:[", pos: blankLoc},
          colonStx  = {name: "COLON", value: ":", key: "'COLON::", pos: blankLoc},
          commaStx  = {name: "COMMA", value: ",", key: "'COMMA:,", pos: blankLoc},
          rBrackStx = {name: "RBRACK", value: "]", key: "'RBRACK:]", pos: blankLoc},
          fakeArrayCall = new symbolExpr("array");
      fakeArrayCall.location = blankLoc;
 
      function makeListEltFromValue(val){
        return {name: "list-elt"
                , kids: [val.toPyret(), commaStx]
                , pos: val.location};
      }
 
      var listElts = vectorCall.args.slice(0, vectorCall.args.length-1).map(makeListEltFromValue),
          lastElt = vectorCall.args[vectorCall.args.length-1].toPyret();
      listElts.push(lastElt);
      return {name:"expr"
              , kids: [{name: "constructor-expr"
                        , kids: [lBrackStx
                                 , {name: "constructor-modifier", kids: [], pos: blankLoc}
                                 , fakeArrayCall.toPyret()
                                 , colonStx].concat(listElts, [rBrackStx])
                        , pos: blankLoc}]
              , pos:loc};
    }
    // Bytecode generation for jsnums types
    jsnums.Rational.prototype.toPyret = function(){
      var loc = this.location;
      return {name: 'frac-expr'
              , kids: [{value: this.stx
                       , key: '\'RATIONAL:'+this.stx
                       , name: 'RATIONAL'
                       , pos: this.location}]
              , pos: loc};
    };
    jsnums.BigInteger.prototype.toPyret = function(){
      var loc = this.location;
      return {name: 'num-expr'
              , kids: [{value: this.stx
                       , key: '\'NUMBER:'+this.stx
                       , name: 'NUMBER'
                       , pos: loc}]
              , pos: loc};
    };
    jsnums.FloatPoint.prototype.toPyret = function(){
      var loc = this.location;
      return {name: 'num-expr'
              , kids: [{value: this.stx
                       , key: '\'NUMBER:'+this.stx
                       , name: 'NUMBER'
                       , pos: loc}]
              , pos: loc};
    };
    jsnums.Complex.prototype.toPyret = function(){
      throw "Complex Numbers are not supported in Pyret";
    };
 
    Char.prototype.toPyret = function(){
      return {name: "string-expr"
                , pos : loc
                , kids: [{key: '\'STRING:'+this.val.toWrittenString()
                         , name: 'STRING'
                         , value: this.val.toWrittenString()
                         , pos : loc}]};
    };
  
    Program.prototype.toPyret = function(){ throw "no toPyret() method defined"; };
    // literals
    // literal(String|Char|Number|Vector)
    // everything has a toPyret() method _except_ Strs,
    // which are a hidden datatype for some reason
    literal.prototype.toPyret = function(){
      var loc = this.location,
          that = this;
      function convertString(){
        return {name: "string-expr"
                , pos : loc
                , kids: [{key: '\'STRING:'+that.val.toWrittenString()
                         , name: 'STRING'
                         , value: that.val.toWrittenString()
                         , pos : loc}]};
      }
      function convertNumber(){
        return {name: "num-expr"
                , kids: [{name: 'NUMBER'
                         , value: that.val.toString()
                         , key: '\'NUMBER:'+that.val.toString()
                         , pos : loc}]
                , pos : loc};
      }
 
      var val = (that.val.toPyret)? that.val.toPyret() :
            isNaN(this)? convertString()  :
              /* else */  convertNumber();
 
      return  {name: "check-test"
              , kids: [{name: "binop-expr"
                      , kids: [{name: "expr"
                               , kids: [{name: "prim-expr"
                                          , kids: [val]
                                          , pos: loc}]
                               , pos: loc}]
                      , pos: loc}]
              , pos: loc};
    };
 

    // Function definition
    // defFunc(name, args, body, stx)
    defFunc.prototype.toPyret = function(){
      var loc = this.location;
      return {name:"stmt"
              , kids:[{name: "fun-expr"
                      , kids: [{name:'FUN', value:'fun', key:'\'FUN:fun', pos:this.stx[0].location}
                               ,{name:'fun-header'
                               , kids: [{name:'ty-params', kids:[], pos: blankLoc}
                                        ,{name:'NAME'
                                          , value: this.name.stx
                                          , key:'\'NAME:'+this.name.stx
                                          , pos: this.name.location}
                                        ,{name:'args'
                                          , kids: [{name:'PARENNOSPACE'
                                                    ,value:'('
                                                 ,key:'\'PARENNOSPACE:('
                                                    ,pos:this.args.location.start().toPyret()}].concat(
                                                    this.args.map(makeBindingFromSymbol)
                                                    ,[{name:'RPAREN'
                                                      ,value:')'
                                                      ,key:'\'RPAREN:)'
                                                      ,pos:this.args.location.end().toPyret()}])
                                          , pos: this.args.location}
                                        ,{name:'return-ann'
                                          ,kids: []
                                          ,pos:loc}]
                                , pos: this.stx[1].location}
                               ,{name:'COLON', value:':', key:'\'COLON::', pos: blankLoc}
                               ,{name:'doc-string', kids: [], pos: blankLoc}
                               ,{name:'block', kids: [this.body.toPyret()], pos: this.body.location}
                               ,{name:'where-clause', kids:  [], pos: blankLoc}
                               ,{name:'end'
                                , kids: [{name:'END',value:'end', key:'\'END:end', pos:this.location.end()}]
                                , pos: this.location.end().toPyret()}]
                      , pos: loc}]
                , pos: loc};
    };

    // Variable definition
    // (define name expr) -> let name = expr
    // see: http://www.pyret.org/docs/latest/Statements.html#%28part._s~3alet-expr%29
    // TODO: detect toplevel declarations?
    defVar.prototype.toPyret = function(){
      return {name: 'let-expr'
              ,kids:[{name: 'let'
                      ,value:'let'
                      ,key:'\'LET:let'
                      ,pos:this.name.location}
                    ,{name: 'toplevel-binding'
                     ,kids:[makeBindingFromSymbol(this.name)]
                     ,pos:this.name.location}
                    ,{name:'EQUALS'
                      ,value:'='
                      ,key:'\'EQUALS:='
                      ,pos:this.name.location}].concat(this.expr.toPyret())
              , pos: this.location};
    };

    // Multi-Variable definition
    // defVars(names, rhs, stx)
    // maybe wait for tuples to be implemented?
    defVars.prototype.toPyret = function(){
      return "translation of Multi-Variable Definitions is not yet implemented";
    };

    // Data Declaration
    // (define-struct foo (x y)) -> data foo_: foo(x, y) end
    // see: http://www.pyret.org/docs/latest/Statements.html#%28part._s~3adata-expr%29
    defStruct.prototype.toPyret = function(){
      var dataStx   = {name: "DATA", value: "data", key: "'DATA:data", pos: this.stx[0].location},
          colonStx  = {name:"COLON", value:":", key:"'COLON::", pos:this.stx[0].location},
          barStx    = {name:"BAR", value:"|", key:"'BAR:|", pos:this.stx[0].location},
          lParenStx = {name:"PARENNOSPACE", value:"(", key:"'PARENNOSPACE:(", pos:this.stx.location},
          rParenStx = {name:"RPAREN", value:")", key:"'RPAREN:)", pos:this.stx.location},
          commaStx  = {name:"COMMA", value:",", key:"'COMMA:,", pos:this.stx.location},
          endStx    = {name:"END", value:"end", key:"'END:end", pos:this.stx.location};
      // makeListVariantMemberFromField : symbolExpr -> list-variant-member
      function makeListVariantMemberFromField(field){
        return {name: "list-variant-member"
                , kids: [{name: "variant-member"
                         , kids: [makeBindingFromSymbol(field)]
                         , pos: field.location}
                        , commaStx]
                , pos:field.location};
      }
 
      var listVariantMembers = this.fields.map(makeListVariantMemberFromField);
      return {name:"stmt"
              , kids: [{name: "data-expr"
                       , kids: [dataStx
                                ,{name:"NAME"
                                  , value: this.name+"_"
                                  , key: "'NAME:"+this.name+"_"
                                  , pos: this.stx[1].location}
                                ,{name:"ty-params"
                                  , kids: [] // there are no parameters for racket datatypes
                                  , pos: this.stx[0].location}
                                , {name:"data-mixins"
                                  , kids: [] // there are no mixins for racket datatypes
                                  , pos: this.stx[0].location}
                                , colonStx
                                , {name:"first-data-variant"
                                  ,kids: [barStx
                                          , {name: "variant-constructor"
                                            , kids:[{name:"NAME"
                                                      , value: this.name+""
                                                      , key: "'NAME:"+this.name
                                                      , pos: this.stx[1].location}
                                                    ,{name: "variant-members"
                                                      , kids:[lParenStx].concat(listVariantMembers, [rParenStx])
                                                      , pos: this.stx[2].location}]
                                            , pos: this.stx[1].location}
                                          , {name: "data-with"
                                            , kids: []
                                            , pos:this.location}]
                                  ,pos:this.stx[1].location}
                                , {name: "data-sharing"
                                  , kids:[]
                                  , pos: blankLoc}
                                , {name: "where-clause"
                                  , kids: []
                                  , pos: blankLoc}
                                , endStx]
                       , pos: this.location}]
              , pos: this.location}
    };
 
    // Begin expression
    // beginExpr(exprs) -> block: exprs end
    // translates to a block: http://www.pyret.org/docs/latest/Blocks.html
    beginExpr.prototype.toPyret = function(){
      var loc = this.location;
      // given a single expr, convert to Pyret and wrap it inside a stmt
      function makeStmtFromExpr(expr){
        return {name:'stmt'
                , kids: [expr.toPyret()]
                , pos: expr.location};
      }
      return {name: 'expr'
              , kids: [{name: 'user-block-expr'
                       , kids: [{name: 'BLOCK', value: 'block', key: '\'BLOCK:block', pos: loc}
                                ,{name: 'block'
                                 , kids:[this.exprs.map(makeStmtFromExpr)]
                                 , pos: this.location}
                                ,{name: 'end'
                                 , kids:[{name:'END',value:'end',key:'\'END:end',pos:loc}]
                                 , pos: loc}]
                       , pos: loc}]
              , pos: loc};
     };

    // Lambda expression
    // lambdaExpr(args, body) -> lam(args): body end
    lambdaExpr.prototype.toPyret = function(){
      var loc = this.location;
      return {name: 'expr'
              , kids: [{name: 'lambda-expr'
                       , kids:[{name:'LAM', value: 'lam', key: '\'LAM:lam', pos: this.stx.location}
                               ,{name:'ty-params', kids:[], pos:loc}
                               ,{name:'args'
                                , kids: [{name:'PARENNOSPACE'
                                          ,value:'('
                                          ,key:'\'PARENNOSPACE:('
                                          ,pos:this.args.location.start().toPyret()}].concat(
                                          this.args.map(makeBindingFromSymbol)
                                          ,[{name:'RPAREN'
                                            ,value:')'
                                            ,key:'\'RPAREN:)'
                                            ,pos:this.args.location.end().toPyret()}])
                                , pos: this.args.location}
                               , {name: 'return-ann', kids: [], pos: loc}
                               , {name:'COLON', value:':', key:'\'COLON::', pos: loc}
                               , {name:'doc-string', kids:[], pos: loc}
                               , {name:'block'
                                , kids:[this.body.toPyret()]
                                , pos: this.body.location}
                               , {name:'where-clause', kids:[], pos: loc}
                               , {name:'end'
                                , kids:[{name:'END',value:'end',key:'\'END:end',pos:loc}]
                                , pos: loc}]
                       , pos: this.location}]
              , pos: loc};
    };
 
    // Local becomes letrec
    // First translate the racket node to letrec, then call toPyret()
    localExpr.prototype.toPyret = function(){
      function defToCouple(d){
        var cpl = new couple(d.name, d.expr, d.stx);
        cpl.location = d.location;
        return cpl
      };
      var racket_letrec = new letrecExpr(this.defs.map(defToCouple), this.body, this.stx);
      racket_letrec.location = this.location;
      return racket_letrec.toPyret();
    };
 
    // call expression
    // callExpr(func, args, stx)
    callExpr.prototype.toPyret = function(){
      var loc = this.location;
      // which functions are infix?
      function getInfixForSym(sym){
        if(!(sym instanceof symbolExpr)) return false;
        var str = sym.val, loc = sym.location;
        return (str==="+")? {name:'PLUS',   value: '+',   key: '\'PLUS: +',   pos: loc}
            : (str==="-")?  {name:'DASH',   value: '-',   key: '\'DASH: -',   pos: loc}
            : (str==="*")?  {name:'STAR',   value: '*',   key: '\'STAR: *',   pos: loc}
            : (str==="/")?  {name:'SLASH',  value: '-',   key: '\'SLASH: /',  pos: loc}
            : (str===">")?  {name:'GT',     value: '>',   key: '\'GT: >',     pos: loc}
            : (str==="<")?  {name:'LT',     value: '<',   key: '\'LT: -',     pos: loc}
            : (str===">=")? {name:'GEQ',    value: '>=',  key: 'GEQ: >=',     pos: loc}
            : (str==="<=")? {name:'LEQ',    value: '<=',  key: 'LEQ: <=',     pos: loc}
            : (str==="=")?  {name:'EQUALEQUAL', value: '==', key: '\'EQUALEQUAL: -', pos: loc}
            : false; // if the function isn't a binop, return false
      }
 
      // runtime calls to "vector" need to be processed specially
      if(this.func.val === "vector") return makeArrayFromVectorCall(this);
 
      // if the function is infix in Pyret, return the binop tree instead of a call-expr
      var infixOperator = getInfixForSym(this.func);
      if(infixOperator){
        return makeBinopTreeForInfixApplication(infixOperator, this.args);
      } else {
        return {name:'app-expr'
                , kids: [{name: 'expr'
                          , kids: [{name: 'id-expr'
                                  , kids: [{name: 'NAME'
                                           , value: this.func.val
                                           , key: '\'NAME:'+this.func.val
                                           , pos: this.func.location}]
                                  , pos: this.func.location}]
                          , pos: this.func.location}
                         ,{name: 'app-args'
                                  , kids: [{name: 'PARENNOSPACE'
                                            , value: '('
                                            , key: '\'PARENNOSPACE:('
                                            , pos: this.location.start()}].concat(
                                           this.args.map(function(p){return p.toPyret()}))
                                  , pos: this.func.location}]
              , pos: loc}
      }
    };

    // if expression maps to if-expr
    // see: http://www.pyret.org/docs/latest/Expressions.html#%28part._s~3aif-expr%29
    ifExpr.prototype.toPyret = function(){
       return {name: 'if-expr'
              , kids: [{name:'IF'
                        ,value:'if'
                        ,key:'\'IF:if'
                        ,pos:this.stx.location}
                       ,this.predicate.toPyret()
                       ,{name:'COLON'
                        ,value:':'
                        ,key:'\'COLON::'
                        ,pos:this.stx.location}
                       ,{name:'block'
                        ,kids:[{name:'stmt'
                               , kids:[this.consequence.toPyret()]
                               , pos: this.consequence.location}]
                        ,pos: this.consequence.location}
                       ,{name:'ELSECOLON'
                        ,value:'else:'
                        ,key:'\'ELSECOLON:else:'
                        ,pos:this.stx.location}
                       ,{name:'block'
                        ,kids:[{name:'stmt'
                               , kids:[this.alternative.toPyret()]
                               , pos: this.alternative.location}]
                        ,pos: this.alternative.location}
                       ,{name:'end'
                        ,kids:[{name:'END'
                                ,value:'end'
                                ,key:'\'END:end'
                                ,pos: this.location.end().toPyret()}]
                        ,pos:this.location.end().toPyret()}]
              , pos: this.location};
    };

    // when(pred, expr) translates to when(pred, expr)
    // unless(pred, expr) translates to when(not(pred), expr)
    // see: http://www.pyret.org/docs/latest/A_Tour_of_Pyret.html#%28part._.When_blocks%29
    // TODO: do we need to wrap the expr in a block?
    whenUnlessExpr.prototype.toPyret = function(){
      var loc = this.location;
 
      // if it's "unless", change the predicate to not(pred) in racket
      if(this.stx.val==="unless"){
        var notFn = new symbolExpr("not"),
            notCall = new callExpr(notFn, [this.predicate]);
        notFn.location = notCall.location = this.predicate.location;
        this.predicate = notCall;
      }
 
      return {name: 'when-expr'
              , kids:[{name:'WHEN', value:'when', key:'\'WHEN:when', pos: this.stx.location}
                      ,this.predicate.toPyret()
                      ,{name:'COLON', value:':', key:'\'COLON::', pos:loc}
                      ,this.exprs.toPyret()
                      ,{name:'end'
                        ,kids:[{name:'END'
                                ,value:'end'
                                ,key:'\'END:end'
                                ,pos: this.location.end().toPyret()}]
                        ,pos:this.location.end().toPyret()}]
              , pos: loc};
    };
 
    // letrec becomes letrec
    // the last binding becomes a let-expr,
    // the rest become letrec-bindings,
    // and the body becomes a block
    letrecExpr.prototype.toPyret = function(){
      function makeLetRecBindingExprFromCouple(couple){
        return {name: "letrec-binding"
                , kids: [makeLetExprFromCouple(couple)
                         , {name:"COMMA"
                            , key: "'COMMA:,"
                            , value:","
                            , pos:couple.location.end().toPyret()}]
                , pos: couple.location};
      }
      var loc = this.location,
          letrecBindings = this.bindings.slice(1).map(makeLetRecBindingExprFromCouple),
          finalLet = makeLetExprFromCouple(this.bindings[this.bindings.length-1]).kids[0],
          letrecStx = {name: "letrec" ,value:"lerec" ,key:"'LETREC:letrec" ,pos:this.stx.location},
          colonStx = {name:"COLON", key: "'COLON::", value:":", pos:this.location},
          bodyBlock = {name:"block", kids:[this.body.toPyret()], pos: this.body.location},
          endStx = {name:"END", key: "'END:end", value:"end", pos:this.location.end().toPyret()};
      return {name:"expr"
              ,kids:[{name: "letrec-expr"
                      ,kids: [letrecStx].concat(letrecBindings, [finalLet], colonStx, bodyBlock, endStx)
                      ,pos:loc}]
              ,pos:loc};
    };
 
    // let -> blockful of let-exprs, BUT...
    // in order to preserve semantics, we introduce temporary identifiers:
    // (let [(a 5) (b a)] b) -> block: a_1 = 5 b_1 = a a = a_1 b = b_1 b end
    // then we can safely convert
    letExpr.prototype.toPyret = function(){
      var loc = this.location;
      var tmpIDs = [],
          // bind the rhs to lhs_tmp
          tmpBindings = this.bindings.map(function(c){
                                            var tmpSym = new symbolExpr(c.first.val+"_tmp"),
                                                tmpBinding = new couple(tmpSym, c.second);
                                            tmpSym.location = c.first.location;
                                            tmpBinding.location = c.location;
                                            tmpIDs.push(tmpSym);
                                            return tmpBinding;
                                          }),
          // bind lhs_tmp to lhs
          newBindings = this.bindings.map(function(c, i){
                                            var c2 = new couple(c.first, tmpIDs[i]);
                                            c2.location = c.location;
                                            return c2;
                                          }),
          stmts = tmpBindings.concat(newBindings).map(makeLetExprFromCouple);
      stmts.push(this.body.toPyret());
      return {name: 'expr'
              , kids: [{name: 'user-block-expr'
                       , kids: [{name: 'BLOCK', value: 'block', key: '\'BLOCK:block', pos: loc}
                                ,{name: 'block'
                                 , kids: stmts
                                 , pos: this.location}
                                ,{name: 'end'
                                 , kids:[{name:'END',value:'end',key:'\'END:end',pos:loc}]
                                 , pos: loc}]
                       , pos: loc}]
              , pos: loc};

    };

    // let* becomes a simple blockful of let-exprs
    // see: http://www.pyret.org/docs/latest/Statements.html#%28part._s~3alet-expr%29
    letStarExpr.prototype.toPyret = function(){
      var loc = this.location,
          stms = this.bindings.map(makeLetExprFromCouple);
      stmts = stms.push(this.body.toPyret());
      return {name: 'expr'
              , kids: [{name: 'user-block-expr'
                       , kids: [{name: 'BLOCK', value: 'block', key: '\'BLOCK:block', pos: loc}
                                ,{name: 'block'
                                 , kids:stmts
                                 , pos: this.location}
                                ,{name: 'end'
                                 , kids:[{name:'END',value:'end',key:'\'END:end',pos:loc}]
                                 , pos: loc}]
                       , pos: loc}]
              , pos: loc};
    };

    // cond -> ask
    // see: http://www.pyret.org/docs/latest/Expressions.html#%28part._s~3aask-expr%29
    condExpr.prototype.toPyret = function(){
      var askStx = {name:"ASKCOLON", value:"ask:", key:"'ASKCOLON:ask:", pos:blankLoc},
          barStx = {name:"BAR", value:"|", key:"'BAR:|", pos:blankLoc},
          thenStx= {name:"THENCOLON", value:"then:", key:"'THENCOLON:then:", pos:blankLoc},
          otherwiseStx = {name:"OTHERWISE",value:"otherwise:",key:"'OTHERWISE:otherwise:",pos:blankLoc},
          endStx = {name:"END",value:"end",key:"'END:end",pos:blankLoc};
 
      function makeIfPipeBranchfromClause(clause){
        return {name: "if-pipe-branch"
                , kids: [barStx
                         ,clause.first.toPyret()
                         ,thenStx
                         ,{name: "block"
                          ,kids: [clause.second.toPyret()]
                          ,pos: clause.second.location}]
                , pos: clause.location};
      }
 
      // make an ifPipe for each non-else clause
      var lastClause  = this.clauses[this.clauses.length-1],
          hasElse     = (lastClause.first.stx && lastClause.first.stx==="else"),
          ifClauses   = hasElse? this.clauses.slice(this.clauses.length-2) : this.clauses,
          branches = ifClauses.map(makeIfPipeBranchfromClause);
 
      // if there's an else clause, turn it into a block and add it and it's syntax to the list of branches
      if(hasElse){
        var elseClause =  this.clauses[this.clauses.length-1],
            otherwiseBlock = {name: "block", kids: [elseClause.second.toPyret()], pos: elseClause.second.location};
        branches = branches.concat([otherwiseStx, otherwiseBlock]);
      }
 
      return {name:"expr"
              , kids: [{name: "if-pipe-expr"
                        , kids: [askStx].concat(branches, [{name: "end", kids:[endStx], pos:blankLoc}])
                        , pos: this.location}]
              , pos: this.location};
    };

    // case -> cases
    // see: http://www.pyret.org/docs/latest/Expressions.html#%28part._s~3acases-expr%29
    caseExpr.prototype.toPyret = function(){
      return "translation of case expressions is not yet implemented";
    };

    // and -> and
    // convert to nested, binary ands
    andExpr.prototype.toPyret = function(){
      var loc = this.stx.location,
          infixOperator = {name:'AND', value: 'and', key: 'AND:and', pos: loc};
      return makeBinopTreeForInfixApplication(infixOperator, this.exprs);
    };

    // or -> or
    // convert to nested, binary ors
    orExpr.prototype.toPyret = function(){
      var loc = this.stx.location,
          infixOperator = {name:'OR', value: 'or', key: 'OR:or', pos: loc};
      return makeBinopTreeForInfixApplication(infixOperator, this.exprs);
    };


    /*  
        Pyret lacks any notion of quoting, 
        so this is a *partially-supported approximation*!!!
     
        quasiquoted expressions could be desugared into mostly-valid
        expressions, but cond, case, and & or would desugar into invalid
        code. Therefore, we throw errors for everything but quoated 
        expressions, and we translate those using loose Pyret equivalents
     */
 
    // quoted literals translate to themselves
    // quoted symbols translate to strings
    // quoted lists evaluate to lists
    quotedExpr.prototype.toPyret = function(){
      if(this.val instanceof literal){
        return this.val.toPyret();
      } else if(this.val instanceof symbolExpr){
        return makeLiteralFromSymbol(this.val);
      } else if (this.val instanceof Array){
        return makeListFromArray(this.val);
      } else {
        throw "There is no translation for "+this.toString();
      }
    };

    // we need to find a way to desugar these
    unquotedExpr.prototype.toPyret = function(){
      throw "IMPOSSIBLE: unquoted expressions should be desugared away";
    };

    unquoteSplice.prototype.toPyret = function(){
      throw "IMPOSSIBLE: unquote-splace expressions should be desugared away";
    };

    quasiquotedExpr.prototype.toPyret = function(){
      throw "IMPOSSIBLE: quasiquoted expressions should be desugared away";
    };

    // symbol expression
    // symbolExpr(val)
    symbolExpr.prototype.toPyret = function(){
      var loc = this.location;
      function getBinopForVal(str){
        return (str==="+")? '_plus'
            : (str==="-")?  '_minus'
            : (str==="*")?  '_times'
            : (str==="/")?  '_divide'
            : (str===">")?  '_greaterthan'
            : (str==="<")?  '_lessthan'
            : (str===">=")? '_greaterequal'
            : (str==="<=")? '_lessequal'
            : (str==="=")?  'equal-always'
            : str; // if the function isn't a binop, return it unmolested
      }
      return {name: 'expr'
             , kids: [{name: 'id-expr'
                      , kids: [{name: 'NAME'
                               , value: getBinopForVal(this.val)
                               , key: '\'NAME:'+getBinopForVal(this.val)
                               , pos: loc}]
                      , pos: loc}]
             , pos: loc};
 }
 
    /////////////////////
    /* Export Bindings */
    /////////////////////
    plt.compiler.toPyretAST = convertToPyret;
})();
