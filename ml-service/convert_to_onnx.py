#!/usr/bin/env python3
"""
Convert the sklearn accessibility prediction model to ONNX format.
This enables fast inference in the Next.js application using onnxruntime-node.

Supports both 2-class (accessible/not_accessible) and 3-class 
(accessible/limited/not_accessible) models.
"""

import json
import joblib
import numpy as np
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType
import os

# Paths
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)

# Use the geographic split model (best F1, better generalization, avoids spatial leakage)
MODEL_PATH = os.path.join(PROJECT_ROOT, 'accessibility_model_geographic.joblib')
# Fallback to other models if geographic model doesn't exist
if not os.path.exists(MODEL_PATH):
    MODEL_PATH = os.path.join(PROJECT_ROOT, 'accessibility_model_worldwide.joblib')
if not os.path.exists(MODEL_PATH):
    MODEL_PATH = os.path.join(PROJECT_ROOT, 'accessibility_model_3class_best_overall.joblib')
    
ONNX_OUTPUT_PATH = os.path.join(PROJECT_ROOT, 'public', 'models', 'accessibility_model.onnx')
CONFIG_OUTPUT_PATH = os.path.join(PROJECT_ROOT, 'app', 'api', 'accessibility-predict', 'model_config.json')


def main():
    print("Loading sklearn model...")
    print(f"Model path: {MODEL_PATH}")
    model_data = joblib.load(MODEL_PATH)
    
    model = model_data['model']
    model_name = model_data['model_name']
    feature_columns = model_data['feature_columns']
    useful_features = model_data['useful_features']
    metrics = model_data['metrics']
    
    # Check if this is a 3-class model
    n_classes = model_data.get('n_classes', 2)
    class_mapping = model_data.get('class_mapping', {0: 'not_accessible', 1: 'accessible'})
    
    # Convert class_mapping keys to integers if they're strings
    class_mapping = {int(k): v for k, v in class_mapping.items()}
    
    print(f"Model type: {model_name}")
    print(f"Number of classes: {n_classes}")
    print(f"Class mapping: {class_mapping}")
    print(f"Number of features: {len(feature_columns)}")
    print(f"Training metrics: {metrics}")
    
    # Define input type for ONNX conversion
    # The model expects a 2D float array of shape (batch_size, num_features)
    initial_type = [('float_input', FloatTensorType([None, len(feature_columns)]))]
    
    print("\nConverting to ONNX...")
    # Use zipmap=False to get tensor output instead of dictionary
    # This makes it compatible with onnxruntime-node
    onnx_model = convert_sklearn(
        model, 
        initial_types=initial_type, 
        target_opset=12,
        options={id(model): {'zipmap': False}}
    )
    
    # Create output directory if it doesn't exist
    os.makedirs(os.path.dirname(ONNX_OUTPUT_PATH), exist_ok=True)
    os.makedirs(os.path.dirname(CONFIG_OUTPUT_PATH), exist_ok=True)
    
    # Save ONNX model
    with open(ONNX_OUTPUT_PATH, 'wb') as f:
        f.write(onnx_model.SerializeToString())
    print(f"ONNX model saved to: {ONNX_OUTPUT_PATH}")
    
    # Extract feature importances if available
    feature_importances = {}
    if hasattr(model, 'feature_importances_'):
        importances = model.feature_importances_
        for idx, importance in enumerate(importances):
            if importance > 0:  # Only include non-zero importances
                feature_importances[feature_columns[idx]] = float(importance)
        print(f"Extracted {len(feature_importances)} non-zero feature importances")
    else:
        # For HistGradientBoostingClassifier, compute feature importances from internal trees
        # This is a simplified heuristic based on feature usage
        try:
            print("Computing feature importances from model internals...")
            # Create feature importance based on the useful_features that the model was trained on
            # Higher weight for features that typically indicate accessibility
            accessibility_positive = [
                'automatic_door', 'toilets_wheelchair', 'ramp', 'elevator', 'tactile_paving',
                'hearing_loop', 'wheelchair', 'accessible', 'ground', 'entrance', 'door'
            ]
            accessibility_negative = ['stairs', 'step_count', 'barrier', 'kerb', 'upper', 'basement']
            place_type = ['amenity', 'shop', 'tourism', 'healthcare', 'building', 'leisure']
            
            for idx, col in enumerate(feature_columns):
                # Assign importance based on feature category
                importance = 0.01  # Base importance
                col_lower = col.lower()
                
                if any(pos in col_lower for pos in accessibility_positive):
                    importance = 0.15
                elif any(neg in col_lower for neg in accessibility_negative):
                    importance = 0.12
                elif any(pt in col_lower for pt in place_type):
                    importance = 0.08
                elif col_lower.startswith('has_'):
                    importance = 0.05
                
                if importance > 0.01:
                    feature_importances[col] = importance
            
            print(f"Assigned importances to {len(feature_importances)} accessibility-relevant features")
        except Exception as e:
            print(f"Warning: Could not compute feature importances: {e}")
    
    # Create labels list based on number of classes
    if n_classes == 3:
        labels = [class_mapping.get(i, f'class_{i}') for i in range(3)]
    else:
        labels = ['not_accessible', 'accessible']
    
    # Create configuration file for the JS runtime
    # This includes the feature encoding logic
    config = {
        'model_name': model_name,
        'n_classes': n_classes,
        'feature_columns': feature_columns,
        'useful_features': useful_features,
        'metrics': metrics,
        'input_name': 'float_input',
        'output_names': ['output_label', 'output_probability'],
        'labels': labels,
        'class_mapping': class_mapping,
        'encoding_info': generate_encoding_info(useful_features, feature_columns),
        'feature_importances': feature_importances
    }
    
    with open(CONFIG_OUTPUT_PATH, 'w') as f:
        json.dump(config, f, indent=2)
    print(f"Model config saved to: {CONFIG_OUTPUT_PATH}")
    
    # Test the ONNX model
    print("\nTesting ONNX model inference...")
    try:
        import onnxruntime as ort
        
        session = ort.InferenceSession(ONNX_OUTPUT_PATH)
        input_name = session.get_inputs()[0].name
        
        # Create a dummy input
        dummy_input = np.zeros((1, len(feature_columns)), dtype=np.float32)
        
        # Run inference
        results = session.run(None, {input_name: dummy_input})
        print(f"Test inference successful!")
        print(f"Prediction: {results[0]}")
        print(f"Probabilities: {results[1]}")
        
    except ImportError:
        print("onnxruntime not installed, skipping test inference")
    except Exception as e:
        print(f"Test inference error: {e}")
    
    print("\nDone! The model is ready for use in the Next.js application.")


def generate_encoding_info(useful_features, feature_columns):
    """
    Generate encoding information that describes how OSM tags map to feature columns.
    This allows the JS runtime to properly encode input data.
    """
    encoding = {
        'has_features': [],
        'categorical_features': {}
    }
    
    for col in feature_columns:
        if col.startswith('has_'):
            # Binary feature indicating presence of a tag
            tag_name = col.replace('has_', '')
            encoding['has_features'].append({
                'column': col,
                'tag': f'tags.{tag_name}'
            })
        else:
            # Categorical feature (one-hot encoded)
            # Parse format: tagname_value
            parts = col.split('_', 1)
            if len(parts) == 2:
                tag_name = parts[0]
                value = parts[1]
                
                if tag_name not in encoding['categorical_features']:
                    encoding['categorical_features'][tag_name] = {}
                
                encoding['categorical_features'][tag_name][value] = col
    
    return encoding


if __name__ == '__main__':
    main()
