'use strict';
const acorn = require('acorn');
const fs = require('fs');
const path = require('path');
const walk = require('acorn-walk');
const gzip = require('gzip-size');
const brotli = require('brotli-size');
const Stats = require('./stats');
const getArguments = require('./utils').getArguments;
const isMemberExpression = require('./utils').isMemberExpression;
const extractLiteralFromInstalled = require('./utils').extractLiteralFromInstalled;
const extractLiteralFromDef = require('./utils').extractLiteralFromDef;
const extractLiteralFromMain = require('./utils').extractLiteralFromMain;
const extractLiteralFromBuiltin = require('./utils').extractLiteralFromBuiltin;
const isValidFunctionExpression = require('./utils').isValidFunctionExpression;
const isFunctionExpression = require('./utils').isFunctionExpression;

function parseLassoBundle(fileName) {
    let filePath = fileName;
    // check absolute path.
    if (!fs.existsSync(filePath)) {
        filePath = path.resolve(fileName);
    }
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const ast = acorn.parse(fileContent, {
        sourceType: 'script'
    });
    let initial = new Stats();
    const walkState = [];
    if (ast.body.length === 0) return 'Empty File';
    // get total bundle size.
    isProgram(ast, walkState, initial, fileContent);
    // iterate the AST tree.
    walk.recursive(
        ast,
        walkState,
        {
            CallExpression(node, state, c) {
                const stats = new Stats();
                if (node.start && node.end) {
                    stats.setSize(node.end - node.start);
                }
                else {
                    stats.setSize(0);
                }
                if (isFunctionExpression(node)) {
                    stats.setPackageName('module.js');
                    stats.setFileName('module.js');
                    stats.setPath('/module.js');
                }
                if (isMemberExpression(node)) {
                    let memberNode = node.callee;
                    if (memberNode.property && memberNode.property.type === 'Identifier') {
                        stats.setType(memberNode.property.name);
                    }
                }
                const args = getArguments(node);
                if (args.length > 0) {
                    extractLiterals(stats, args);
                }
                if (stats.getType() === 'def') {
                    extractContent(fileContent, stats, args);
                }
                walkState.push(stats);
            }
        });
    const manifestPath = process.cwd();
    fs.writeFileSync(manifestPath + '/lasso-stats.json', JSON.stringify(walkState, null, 2));
    return { walkState };
}

// extract literal from AST tree.
function extractLiterals(stats, args) {
    if (stats.getType() !== null && (stats.getType() === 'installed' || stats.getType() === 'builtin')) {
        extractLiteralFromInstalled(stats, args);
    }

    if (stats.getType() !== null && stats.getType() === 'def') {
        extractLiteralFromDef(stats, args[0]);
    }

    if (stats.getType() !== null && (stats.getType() === 'main' || stats.getType() === 'remap')) {
        extractLiteralFromMain(stats, args[0]);
    }
}

function isProgram(ast, walkState, initial, fileContent) {
    if (ast.type === 'Program') {
        initial.setPackageName('BundleSize');
        initial.setFileName('program');
        initial.setSize(ast.end - ast.start);
        initial.setGzipSize(gzip.sync(fileContent));
        initial.setBrotiSize(brotli.sync(fileContent));
        walkState.push(initial);
    }
}

function extractContent(fileContent, stats, node) {
    if (isValidFunctionExpression(node[1])) {
        // get start position.
        let start = node[0].start || 0;
        // get end position.
        let end = node[1].end || 0;
        const gzipSize = gzip.sync(fileContent.slice(start - 1, end + 1));
        const brotiSize = brotli.sync(fileContent.slice(start - 1, end + 1));
        stats.setSize((end - start) + 2);
        stats.setGzipSize(gzipSize);
        stats.setBrotiSize(brotiSize);
        stats.setContent(fileContent.slice(start, end));
    }
}

module.exports = parseLassoBundle;
